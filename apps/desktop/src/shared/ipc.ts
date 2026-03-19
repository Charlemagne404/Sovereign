import type {
  AppSettings,
  FixActionResult,
  ProcessInfo,
  ServiceSummary,
  StartupItem,
  SystemMetricsSnapshot,
  TempCleanupPreview,
  WatchdogEvent,
  WatchdogEventQuery
} from './models';

export const IPC_CHANNELS = {
  dashboard: {
    getSnapshot: 'dashboard:getSnapshot',
    updated: 'dashboard:updated'
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
    disableStartupItem: 'fixer:disableStartupItem',
    listServices: 'fixer:listServices',
    restartService: 'fixer:restartService',
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
  process: ProcessInfo;
}

export interface DisableStartupItemRequest {
  startupItemId: string;
}

export interface RestartServiceRequest {
  serviceName: string;
  displayName: string;
}

export interface IpcRequestMap {
  [IPC_CHANNELS.dashboard.getSnapshot]: undefined;
  [IPC_CHANNELS.events.list]: EventsListRequest | undefined;
  [IPC_CHANNELS.settings.get]: undefined;
  [IPC_CHANNELS.settings.update]: UpdateSettingsRequest;
  [IPC_CHANNELS.fixer.previewTempCleanup]: undefined;
  [IPC_CHANNELS.fixer.executeTempCleanup]: ExecuteTempCleanupRequest;
  [IPC_CHANNELS.fixer.killProcess]: KillProcessRequest;
  [IPC_CHANNELS.fixer.openProcessLocation]: OpenProcessLocationRequest;
  [IPC_CHANNELS.fixer.listStartupItems]: undefined;
  [IPC_CHANNELS.fixer.disableStartupItem]: DisableStartupItemRequest;
  [IPC_CHANNELS.fixer.listServices]: undefined;
  [IPC_CHANNELS.fixer.restartService]: RestartServiceRequest;
  [IPC_CHANNELS.fixer.refreshDiagnostics]: undefined;
}

export interface IpcResponseMap {
  [IPC_CHANNELS.dashboard.getSnapshot]: SystemMetricsSnapshot;
  [IPC_CHANNELS.events.list]: WatchdogEvent[];
  [IPC_CHANNELS.settings.get]: AppSettings;
  [IPC_CHANNELS.settings.update]: AppSettings;
  [IPC_CHANNELS.fixer.previewTempCleanup]: TempCleanupPreview;
  [IPC_CHANNELS.fixer.executeTempCleanup]: FixActionResult;
  [IPC_CHANNELS.fixer.killProcess]: FixActionResult;
  [IPC_CHANNELS.fixer.openProcessLocation]: FixActionResult;
  [IPC_CHANNELS.fixer.listStartupItems]: StartupItem[];
  [IPC_CHANNELS.fixer.disableStartupItem]: FixActionResult;
  [IPC_CHANNELS.fixer.listServices]: ServiceSummary[];
  [IPC_CHANNELS.fixer.restartService]: FixActionResult;
  [IPC_CHANNELS.fixer.refreshDiagnostics]: FixActionResult;
}

export interface IpcEventMap {
  [IPC_CHANNELS.dashboard.updated]: SystemMetricsSnapshot;
  [IPC_CHANNELS.events.updated]: WatchdogEvent[];
  [IPC_CHANNELS.settings.updated]: AppSettings;
}

export interface DesktopApi {
  getDashboardSnapshot(): Promise<SystemMetricsSnapshot>;
  listRecentEvents(query?: WatchdogEventQuery): Promise<WatchdogEvent[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
  previewTempCleanup(): Promise<TempCleanupPreview>;
  executeTempCleanup(request: ExecuteTempCleanupRequest): Promise<FixActionResult>;
  killProcess(request: KillProcessRequest): Promise<FixActionResult>;
  openProcessLocation(request: OpenProcessLocationRequest): Promise<FixActionResult>;
  listStartupItems(): Promise<StartupItem[]>;
  disableStartupItem(request: DisableStartupItemRequest): Promise<FixActionResult>;
  listServices(): Promise<ServiceSummary[]>;
  restartService(request: RestartServiceRequest): Promise<FixActionResult>;
  refreshDiagnostics(): Promise<FixActionResult>;
  onDashboardUpdated(listener: (snapshot: SystemMetricsSnapshot) => void): () => void;
  onEventsUpdated(listener: (events: WatchdogEvent[]) => void): () => void;
  onSettingsUpdated(listener: (settings: AppSettings) => void): () => void;
}
