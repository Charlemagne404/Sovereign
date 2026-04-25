import { readFile } from 'node:fs/promises';

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings
} from '@shared/models';
import { cloneSettings, normalizeSettings } from '@shared/settings';

import type { SettingsStore } from './settingsStore';
import type { SqliteDatabase } from './sqliteDatabase';

const SETTINGS_KEY = 'current';
interface LegacySettingsStoreFile {
  version: number;
  settings: AppSettings;
}

const parseLegacySettings = async (legacyPath?: string): Promise<AppSettings | null> => {
  if (!legacyPath) {
    return null;
  }

  try {
    const rawStore = await readFile(legacyPath, 'utf8');
    const parsedStore = JSON.parse(rawStore) as Partial<LegacySettingsStoreFile>;
    return normalizeSettings(parsedStore.settings);
  } catch {
    return null;
  }
};

export class SqliteSettingsStore implements SettingsStore {
  private currentSettings = cloneSettings(DEFAULT_APP_SETTINGS);

  constructor(
    private readonly database: SqliteDatabase,
    private readonly legacySettingsPath?: string
  ) {}

  async initialize(): Promise<void> {
    await this.database.initialize();
    const storedSettings = await this.database.read((database) => {
      const row = this.database.queryRows(
        database,
        `SELECT value FROM app_settings WHERE key = ? LIMIT 1`,
        [SETTINGS_KEY]
      )[0];

      if (!row) {
        return null;
      }

      return normalizeSettings(row.value ? JSON.parse(String(row.value)) : undefined);
    });

    if (storedSettings) {
      this.currentSettings = storedSettings;
      return;
    }

    const legacySettings = await parseLegacySettings(this.legacySettingsPath);
    this.currentSettings = legacySettings || cloneSettings(DEFAULT_APP_SETTINGS);
    await this.persistSettings(this.currentSettings);
  }

  getSettings(): AppSettings {
    return cloneSettings(this.currentSettings);
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    this.currentSettings = normalizeSettings(settings);
    await this.persistSettings(this.currentSettings);
    return this.getSettings();
  }

  private async persistSettings(settings: AppSettings): Promise<void> {
    await this.database.write((database) => {
      database.run(
        `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
        [SETTINGS_KEY, JSON.stringify(settings)]
      );
    });
  }
}
