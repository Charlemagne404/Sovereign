import path from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';

import { app, BrowserWindow, dialog } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc';
import { FixerService } from '@main/fixer/fixerService';
import { createSystemProbe } from '@main/platform/createSystemProbe';
import { registerIpcHandlers } from '@main/ipc/registerIpc';
import { DashboardService } from '@main/services/dashboardService';
import { JsonEventStore } from '@main/store/jsonEventStore';
import { JsonSettingsStore } from '@main/store/jsonSettingsStore';
import { WatchdogService } from '@main/watchdog/watchdogService';

const WINDOW_CONFIG = {
  width: 1520,
  height: 940,
  minWidth: 1240,
  minHeight: 820
} as const;
const WATCHDOG_STARTUP_DELAY_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let dashboardService: DashboardService | null = null;
let watchdogService: WatchdogService | null = null;
let isQuitting = false;
let watchdogStartupTimer: NodeJS.Timeout | null = null;

const STARTUP_LOG_DIRECTORY = path.join(process.env.SystemDrive || 'C:', 'temp');
const STARTUP_LOG_PATH = path.join(STARTUP_LOG_DIRECTORY, 'sovereign-startup.log');

const logStartup = (message: string, error?: unknown): void => {
  const timestamp = new Date().toISOString();
  const errorMessage =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack || ''}`.trim()
      : error
        ? String(error)
        : '';

  try {
    mkdirSync(STARTUP_LOG_DIRECTORY, { recursive: true });
    appendFileSync(
      STARTUP_LOG_PATH,
      `[${timestamp}] ${message}${errorMessage ? `\n${errorMessage}` : ''}\n`,
      'utf8'
    );
  } catch (writeError) {
    console.error('[main] failed to write startup log', writeError);
  }
};

const broadcastDashboardUpdate = (channel: string, payload: unknown): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
};

const createMainWindow = async (): Promise<void> => {
  logStartup('createMainWindow:start');

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    ...WINDOW_CONFIG,
    backgroundColor: '#09111b',
    title: 'Sovereign',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl) => {
      const message = `Renderer failed to load (${errorCode}): ${errorDescription} [${validatedUrl}]`;
      console.error('[main] renderer load failed', message);
      logStartup('createMainWindow:did-fail-load', new Error(message));

      dialog.showErrorBox('Sovereign renderer failed to load', message);
    }
  );

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const message = `Renderer process exited (${details.reason}).`;
    console.error('[main] renderer process gone', details);
    logStartup('createMainWindow:render-process-gone', new Error(message));
  });

  mainWindow.focus();

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    logStartup('createMainWindow:loaded-dev-url');
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  logStartup('createMainWindow:loaded-file');
};

const initializeServices = async (): Promise<void> => {
  logStartup('initializeServices:start');
  const eventStore = new JsonEventStore(path.join(app.getPath('userData'), 'events.json'));
  const settingsStore = new JsonSettingsStore(path.join(app.getPath('userData'), 'settings.json'));

  await settingsStore.initialize();
  await eventStore.initialize();

  dashboardService = new DashboardService(
    createSystemProbe(),
    settingsStore,
    settingsStore.getSettings().metricsRefreshIntervalMs
  );

  watchdogService = new WatchdogService(eventStore, settingsStore.getSettings());
  const fixerService = new FixerService({
    dashboardService,
    watchdogService
  });

  // Register IPC before the first telemetry poll so the renderer can load and report
  // initialization failures instead of hitting "No handler registered" errors.
  registerIpcHandlers({
    dashboardService,
    eventStore,
    settingsStore,
    fixerService,
    watchdogService,
    onSettingsUpdated: (settings) => {
      broadcastDashboardUpdate(IPC_CHANNELS.settings.updated, settings);
    }
  });

  dashboardService.subscribe((snapshot) => {
    broadcastDashboardUpdate(IPC_CHANNELS.dashboard.updated, snapshot);
  });

  watchdogService.subscribe((events) => {
    broadcastDashboardUpdate(IPC_CHANNELS.events.updated, events);
  });

  try {
    await dashboardService.initialize();
    dashboardService.start();

    watchdogStartupTimer = setTimeout(() => {
      watchdogStartupTimer = null;

      void (async () => {
        try {
          await watchdogService?.initialize();
          watchdogService?.start();
        } catch (error) {
          reportMainProcessFailure('watchdog:start-failure', error);
        }
      })();
    }, WATCHDOG_STARTUP_DELAY_MS);
  } catch (error) {
    logStartup('initializeServices:background-failure', error);
    throw error;
  }

  logStartup('initializeServices:complete');
};

const reportBootstrapFailure = (error: unknown): void => {
  const message = error instanceof Error ? error.message : 'Unknown startup error.';
  console.error('[main] failed to initialize Sovereign', error);
  logStartup('bootstrap:failure', error);

  if (isQuitting) {
    return;
  }

  dialog.showErrorBox(
    'Sovereign startup failed',
    `Sovereign could not finish initializing its local services.\n\n${message}`
  );
};

const reportMainProcessFailure = (context: string, error: unknown): void => {
  const message = error instanceof Error ? error.message : 'Unknown process error.';
  console.error(`[main] ${context}`, error);
  logStartup(context, error);

  if (isQuitting) {
    return;
  }

  dialog.showErrorBox('Sovereign encountered a runtime error', `${context}\n\n${message}`);
};

const bootstrap = async (): Promise<void> => {
  logStartup('bootstrap:start');
  await createMainWindow();

  try {
    await initializeServices();
  } catch (error) {
    reportBootstrapFailure(error);
  }
};

app.whenReady().then(() => {
  logStartup('app:ready');
  void app.setAppUserModelId('com.continental.sovereign');
  void bootstrap();

  app.on('activate', () => {
    void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (watchdogStartupTimer) {
    clearTimeout(watchdogStartupTimer);
    watchdogStartupTimer = null;
  }
  dashboardService?.stop();
  watchdogService?.stop();
});

process.on('uncaughtException', (error) => {
  reportMainProcessFailure('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  reportMainProcessFailure('unhandledRejection', reason);
});
