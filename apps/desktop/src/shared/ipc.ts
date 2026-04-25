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
} from './models';

export const IPC_CHANNELS = {
  dashboard: {
    getSnapshot: 'dashboard:getSnapshot',
    updated: 'dashboard:updated'
  },
  watchdog: {
    getMonitorStatuses: 'watchdog:getMonitorStatuses',
    statusesUpdated: 'watchdog:statusesUpdated'
  },
  events: {
    list: 'events:list',
    updated: 'events:updated'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    updated: 'settings:updated'
  },
  fixer: {
    previewTempCleanup: 'fixer:previewTempCleanup',
    executeTempCleanup: 'fixer:executeTempCleanup',
    killProcess: 'fixer:killProcess',
    openProcessLocation: 'fixer:openProcessLocation',
    listStartupItems: 'fixer:listStartupItems',
    listStartupBackups: 'fixer:listStartupBackups',
    disableStartupItem: 'fixer:disableStartupItem',
    restoreStartupItem: 'fixer:restoreStartupItem',
    listServices: 'fixer:listServices',
    startService: 'fixer:startService',
    stopService: 'fixer:stopService',
    restartService: 'fixer:restartService',
    listActionHistory: 'fixer:listActionHistory',
    historyUpdated: 'fixer:historyUpdated',
    runUtilityAction: 'fixer:runUtilityAction',
    refreshDiagnostics: 'fixer:refreshDiagnostics'
  }
} as const;

export type EventsListRequest = WatchdogEventQuery;
export type UpdateSettingsRequest = AppSettings;

export interface ExecuteTempCleanupRequest {
  previewId: string;
  entryIds?: string[];
}

export interface KillProcessRequest {
  pid: number;
  name: string;
}

export interface OpenProcessLocationRequest {
  name: string;
  path: string;
  pid?: number | null;
}

export interface DisableStartupItemRequest {
  startupItemId: string;
}

export interface RestoreStartupItemRequest {
  backupId: string;
}

export interface RestartServiceRequest {
  serviceName: string;
  displayName: string;
}

export interface StartServiceRequest {
  serviceName: string;
  displayName: string;
}

export interface StopServiceRequest {
  serviceName: string;
  displayName: string;
}

export interface RunUtilityActionRequest {
  action:
    | 'flush-dns'
    | 'restart-explorer'
    | 'empty-recycle-bin'
    | 'restart-finder'
    | 'empty-trash';
}

export interface ListActionHistoryRequest {
  limit?: number;
}

export interface IpcRequestMap {
  [IPC_CHANNELS.dashboard.getSnapshot]: undefined;
  [IPC_CHANNELS.watchdog.getMonitorStatuses]: undefined;
  [IPC_CHANNELS.events.list]: EventsListRequest | undefined;
  [IPC_CHANNELS.settings.get]: undefined;
  [IPC_CHANNELS.settings.update]: UpdateSettingsRequest;
  [IPC_CHANNELS.fixer.previewTempCleanup]: undefined;
  [IPC_CHANNELS.fixer.executeTempCleanup]: ExecuteTempCleanupRequest;
  [IPC_CHANNELS.fixer.killProcess]: KillProcessRequest;
  [IPC_CHANNELS.fixer.openProcessLocation]: OpenProcessLocationRequest;
  [IPC_CHANNELS.fixer.listStartupItems]: undefined;
  [IPC_CHANNELS.fixer.listStartupBackups]: undefined;
  [IPC_CHANNELS.fixer.disableStartupItem]: DisableStartupItemRequest;
  [IPC_CHANNELS.fixer.restoreStartupItem]: RestoreStartupItemRequest;
  [IPC_CHANNELS.fixer.listServices]: undefined;
  [IPC_CHANNELS.fixer.startService]: StartServiceRequest;
  [IPC_CHANNELS.fixer.stopService]: StopServiceRequest;
  [IPC_CHANNELS.fixer.restartService]: RestartServiceRequest;
  [IPC_CHANNELS.fixer.listActionHistory]: ListActionHistoryRequest | undefined;
  [IPC_CHANNELS.fixer.runUtilityAction]: RunUtilityActionRequest;
  [IPC_CHANNELS.fixer.refreshDiagnostics]: undefined;
}

export interface IpcResponseMap {
  [IPC_CHANNELS.dashboard.getSnapshot]: SystemMetricsSnapshot;
  [IPC_CHANNELS.watchdog.getMonitorStatuses]: WatchdogMonitorRuntime[];
  [IPC_CHANNELS.events.list]: WatchdogEvent[];
  [IPC_CHANNELS.settings.get]: AppSettings;
  [IPC_CHANNELS.settings.update]: AppSettings;
  [IPC_CHANNELS.fixer.previewTempCleanup]: TempCleanupPreview;
  [IPC_CHANNELS.fixer.executeTempCleanup]: FixActionResult;
  [IPC_CHANNELS.fixer.killProcess]: FixActionResult;
  [IPC_CHANNELS.fixer.openProcessLocation]: FixActionResult;
  [IPC_CHANNELS.fixer.listStartupItems]: StartupItem[];
  [IPC_CHANNELS.fixer.listStartupBackups]: StartupBackupSummary[];
  [IPC_CHANNELS.fixer.disableStartupItem]: FixActionResult;
  [IPC_CHANNELS.fixer.restoreStartupItem]: FixActionResult;
  [IPC_CHANNELS.fixer.listServices]: ServiceSummary[];
  [IPC_CHANNELS.fixer.startService]: FixActionResult;
  [IPC_CHANNELS.fixer.stopService]: FixActionResult;
  [IPC_CHANNELS.fixer.restartService]: FixActionResult;
  [IPC_CHANNELS.fixer.listActionHistory]: FixActionResult[];
  [IPC_CHANNELS.fixer.runUtilityAction]: FixActionResult;
  [IPC_CHANNELS.fixer.refreshDiagnostics]: FixActionResult;
}

export interface IpcEventMap {
  [IPC_CHANNELS.dashboard.updated]: SystemMetricsSnapshot;
  [IPC_CHANNELS.watchdog.statusesUpdated]: WatchdogMonitorRuntime[];
  [IPC_CHANNELS.events.updated]: WatchdogEvent[];
  [IPC_CHANNELS.settings.updated]: AppSettings;
  [IPC_CHANNELS.fixer.historyUpdated]: FixActionResult;
}

export interface DesktopApi {
  getDashboardSnapshot(): Promise<SystemMetricsSnapshot>;
  getWatchdogMonitorStatuses(): Promise<WatchdogMonitorRuntime[]>;
  listRecentEvents(query?: WatchdogEventQuery): Promise<WatchdogEvent[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
  previewTempCleanup(): Promise<TempCleanupPreview>;
  executeTempCleanup(request: ExecuteTempCleanupRequest): Promise<FixActionResult>;
  killProcess(request: KillProcessRequest): Promise<FixActionResult>;
  openProcessLocation(request: OpenProcessLocationRequest): Promise<FixActionResult>;
  listStartupItems(): Promise<StartupItem[]>;
  listStartupBackups(): Promise<StartupBackupSummary[]>;
  disableStartupItem(request: DisableStartupItemRequest): Promise<FixActionResult>;
  restoreStartupItem(request: RestoreStartupItemRequest): Promise<FixActionResult>;
  listServices(): Promise<ServiceSummary[]>;
  startService(request: StartServiceRequest): Promise<FixActionResult>;
  stopService(request: StopServiceRequest): Promise<FixActionResult>;
  restartService(request: RestartServiceRequest): Promise<FixActionResult>;
  listActionHistory(request?: ListActionHistoryRequest): Promise<FixActionResult[]>;
  runUtilityAction(request: RunUtilityActionRequest): Promise<FixActionResult>;
  refreshDiagnostics(): Promise<FixActionResult>;
  onDashboardUpdated(listener: (snapshot: SystemMetricsSnapshot) => void): () => void;
  onWatchdogMonitorStatusesUpdated(
    listener: (statuses: WatchdogMonitorRuntime[]) => void
  ): () => void;
  onEventsUpdated(listener: (events: WatchdogEvent[]) => void): () => void;
  onSettingsUpdated(listener: (settings: AppSettings) => void): () => void;
  onFixerHistoryUpdated(listener: (result: FixActionResult) => void): () => void;
}
