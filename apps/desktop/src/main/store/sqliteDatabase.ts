import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

type SqlValue = string | number | Uint8Array | null;
type SqlParams = SqlValue[] | Record<string, SqlValue> | undefined;

interface SqlJsStatement {
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

interface SqlJsDatabase {
  run(sql: string, params?: SqlParams): void;
  prepare(sql: string, params?: SqlParams): SqlJsStatement;
  export(): Uint8Array;
}

interface SqlJsStatic {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}

type SqlJsInitializer = (config: { wasmBinary: Uint8Array }) => Promise<SqlJsStatic>;

const initSqlJs = require('sql.js') as SqlJsInitializer;
const SQL_JS_WASM_PATH = require.resolve('sql.js/dist/sql-wasm.wasm');

const SQL_MODULE_PROMISE = (async (): Promise<SqlJsStatic> => {
  const wasmBinary = await readFile(SQL_JS_WASM_PATH);
  return initSqlJs({ wasmBinary });
})();

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchdog_events (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'watchdog',
  category TEXT NOT NULL DEFAULT 'application',
  severity TEXT NOT NULL DEFAULT 'info',
  kind TEXT NOT NULL DEFAULT 'status',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  subject_name TEXT,
  subject_path TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watchdog_events_timestamp
  ON watchdog_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS action_history (
  action_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_history_timestamp
  ON action_history(timestamp DESC);
`;

const WATCHDOG_EVENT_COLUMN_DEFINITIONS = {
  source: `TEXT NOT NULL DEFAULT 'watchdog'`,
  category: `TEXT NOT NULL DEFAULT 'application'`,
  severity: `TEXT NOT NULL DEFAULT 'info'`,
  kind: `TEXT NOT NULL DEFAULT 'status'`,
  title: `TEXT NOT NULL DEFAULT ''`,
  description: `TEXT NOT NULL DEFAULT ''`,
  subject_name: 'TEXT',
  subject_path: 'TEXT',
  search_text: `TEXT NOT NULL DEFAULT ''`
} as const;

const WATCHDOG_EVENT_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_watchdog_events_source_timestamp
   ON watchdog_events(source, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_watchdog_events_category_timestamp
   ON watchdog_events(category, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_watchdog_events_severity_timestamp
   ON watchdog_events(severity, timestamp DESC)`
] as const;

export class SqliteDatabase {
  private databasePromise: Promise<SqlJsDatabase> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly databasePath: string) {}

  async initialize(): Promise<void> {
    await this.getDatabase();
  }

  async read<T>(reader: (database: SqlJsDatabase) => T): Promise<T> {
    const database = await this.getDatabase();
    return reader(database);
  }

  async write<T>(writer: (database: SqlJsDatabase) => T | Promise<T>): Promise<T> {
    let result: T | undefined;

    const operation = this.writeQueue.catch(() => undefined).then(async () => {
      const database = await this.getDatabase();

      database.run('BEGIN');

      try {
        result = await writer(database);
        database.run('COMMIT');
      } catch (error) {
        database.run('ROLLBACK');
        throw error;
      }

      await this.persist(database);
    });

    this.writeQueue = operation.then(() => undefined, () => undefined);

    await operation;
    return result as T;
  }

  queryRows(
    database: SqlJsDatabase,
    sql: string,
    params?: SqlParams
  ): Array<Record<string, unknown>> {
    const statement = database.prepare(sql, params);
    const rows: Array<Record<string, unknown>> = [];

    try {
      while (statement.step()) {
        rows.push(statement.getAsObject());
      }
    } finally {
      statement.free();
    }

    return rows;
  }

  private async getDatabase(): Promise<SqlJsDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.loadDatabase();
    }

    return this.databasePromise;
  }

  private async loadDatabase(): Promise<SqlJsDatabase> {
    await mkdir(path.dirname(this.databasePath), { recursive: true });

    const [sqlJs, serializedDatabase] = await Promise.all([
      SQL_MODULE_PROMISE,
      this.readSerializedDatabase()
    ]);
    const database = serializedDatabase
      ? new sqlJs.Database(serializedDatabase)
      : new sqlJs.Database();

    database.run(SCHEMA_SQL);
    this.ensureWatchdogEventSchema(database);
    database.run(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schemaVersion', '1')`
    );

    if (!serializedDatabase) {
      await this.persist(database);
    }

    return database;
  }

  private async readSerializedDatabase(): Promise<Uint8Array | null> {
    try {
      return await readFile(this.databasePath);
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  private async persist(database: SqlJsDatabase): Promise<void> {
    await writeFile(this.databasePath, database.export());
  }

  private ensureWatchdogEventSchema(database: SqlJsDatabase): void {
    const existingColumns = new Set(
      this.queryRows(database, 'PRAGMA table_info(watchdog_events)').map((row) =>
        String(row.name || '')
      )
    );

    for (const [columnName, definition] of Object.entries(WATCHDOG_EVENT_COLUMN_DEFINITIONS)) {
      if (existingColumns.has(columnName)) {
        continue;
      }

      database.run(`ALTER TABLE watchdog_events ADD COLUMN ${columnName} ${definition}`);
    }

    for (const statement of WATCHDOG_EVENT_INDEXES) {
      database.run(statement);
    }
  }
}
