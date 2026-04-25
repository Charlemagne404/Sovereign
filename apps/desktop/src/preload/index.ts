import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IPC_CHANNELS, type DesktopApi } from '@shared/ipc';
import type {
  DisableStartupItemRequest,
  ExecuteTempCleanupRequest,
  KillProcessRequest,
  ListActionHistoryRequest,
  OpenProcessLocationRequest,
  RunUtilityActionRequest,
  RestoreStartupItemRequest,
  StartServiceRequest,
  StopServiceRequest,
  RestartServiceRequest,
  UpdateSettingsRequest
} from '@shared/ipc';
import type {
  AppSettings,
  FixActionResult,
  ServiceSummary,
  StartupBackupSummary,
  StartupItem,
  SystemMetricsSnapshot,
  TempCleanupPreview,
  WatchdogEvent,
  WatchdogEventQuery,
  WatchdogMonitorRuntime
} from '@shared/models';

const api: DesktopApi = {
  getDashboardSnapshot: () =>
    ipcRenderer.invoke(IPC_CHANNELS.dashboard.getSnapshot) as Promise<SystemMetricsSnapshot>,
  getWatchdogMonitorStatuses: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.watchdog.getMonitorStatuses
    ) as Promise<WatchdogMonitorRuntime[]>,
  listRecentEvents: (query?: WatchdogEventQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.events.list, query) as Promise<WatchdogEvent[]>,
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.settings.get) as Promise<AppSettings>,
  updateSettings: (settings: UpdateSettingsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.settings.update, settings) as Promise<AppSettings>,
  previewTempCleanup: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.previewTempCleanup
    ) as Promise<TempCleanupPreview>,
  executeTempCleanup: (request: ExecuteTempCleanupRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.executeTempCleanup,
      request
    ) as Promise<FixActionResult>,
  killProcess: (request: KillProcessRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.fixer.killProcess, request) as Promise<FixActionResult>,
  openProcessLocation: (request: OpenProcessLocationRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.openProcessLocation,
      request
    ) as Promise<FixActionResult>,
  listStartupItems: () =>
    ipcRenderer.invoke(IPC_CHANNELS.fixer.listStartupItems) as Promise<StartupItem[]>,
  listStartupBackups: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.listStartupBackups
    ) as Promise<StartupBackupSummary[]>,
  disableStartupItem: (request: DisableStartupItemRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.disableStartupItem,
      request
    ) as Promise<FixActionResult>,
  restoreStartupItem: (request: RestoreStartupItemRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.restoreStartupItem,
      request
    ) as Promise<FixActionResult>,
  listServices: () =>
    ipcRenderer.invoke(IPC_CHANNELS.fixer.listServices) as Promise<ServiceSummary[]>,
  startService: (request: StartServiceRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.startService,
      request
    ) as Promise<FixActionResult>,
  stopService: (request: StopServiceRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.stopService,
      request
    ) as Promise<FixActionResult>,
  restartService: (request: RestartServiceRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.restartService,
      request
    ) as Promise<FixActionResult>,
  listActionHistory: (request?: ListActionHistoryRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.listActionHistory,
      request
    ) as Promise<FixActionResult[]>,
  runUtilityAction: (request: RunUtilityActionRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.fixer.runUtilityAction,
      request
    ) as Promise<FixActionResult>,
  refreshDiagnostics: () =>
    ipcRenderer.invoke(IPC_CHANNELS.fixer.refreshDiagnostics) as Promise<FixActionResult>,
  onDashboardUpdated: (listener) => {
    const subscription = (
      _event: IpcRendererEvent,
      snapshot: SystemMetricsSnapshot
    ): void => {
      listener(snapshot);
    };

    ipcRenderer.on(IPC_CHANNELS.dashboard.updated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.dashboard.updated, subscription);
    };
  },
  onWatchdogMonitorStatusesUpdated: (listener) => {
    const subscription = (
      _event: IpcRendererEvent,
      statuses: WatchdogMonitorRuntime[]
    ): void => {
      listener(statuses);
    };

    ipcRenderer.on(IPC_CHANNELS.watchdog.statusesUpdated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.watchdog.statusesUpdated, subscription);
    };
  },
  onEventsUpdated: (listener) => {
    const subscription = (
      _event: IpcRendererEvent,
      events: WatchdogEvent[]
    ): void => {
      listener(events);
    };

    ipcRenderer.on(IPC_CHANNELS.events.updated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.events.updated, subscription);
    };
  },
  onSettingsUpdated: (listener) => {
    const subscription = (_event: IpcRendererEvent, settings: AppSettings): void => {
      listener(settings);
    };

    ipcRenderer.on(IPC_CHANNELS.settings.updated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.settings.updated, subscription);
    };
  },
  onFixerHistoryUpdated: (listener) => {
    const subscription = (_event: IpcRendererEvent, result: FixActionResult): void => {
      listener(result);
    };

    ipcRenderer.on(IPC_CHANNELS.fixer.historyUpdated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.fixer.historyUpdated, subscription);
    };
  }
};

contextBridge.exposeInMainWorld('sovereign', Object.freeze(api));
