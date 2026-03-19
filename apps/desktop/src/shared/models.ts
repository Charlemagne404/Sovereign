export type MetricStatus = 'healthy' | 'elevated' | 'stressed';
export type WatchdogSeverity = 'info' | 'unusual' | 'suspicious';
export type PlatformKey = 'windows' | 'macos' | 'linux' | 'unknown';
export type WatchdogSourceId =
  | 'watchdog'
  | 'process-launch'
  | 'startup-items'
  | 'scheduled-tasks'
  | 'defender-status'
  | 'firewall-status';

export interface ResourceAdvice {
  headline: string;
  details: string;
  action: string;
}

export interface CpuMetrics {
  usagePercent: number;
  coreCount: number;
  loadAverage: number[];
  userPercent: number;
  systemPercent: number;
  speedGHz: number | null;
  temperatureC: number | null;
  perCoreUsagePercent: number[];
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface MemoryMetrics {
  usagePercent: number;
  usedBytes: number;
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
  cachedBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface DiskVolume {
  name: string;
  mount: string;
  filesystem: string;
  sizeBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface DiskMetrics {
  usagePercent: number;
  usedBytes: number;
  totalBytes: number;
  volumes: DiskVolume[];
  io: {
    readBytesPerSec: number;
    writeBytesPerSec: number;
    totalBytesPerSec: number;
  };
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface NetworkInterfaceMetrics {
  name: string;
  type: string;
  isExternal: boolean;
  speedMbps: number | null;
  status: string;
  receiveBytesPerSec: number;
  transmitBytesPerSec: number;
  totalBytesPerSec: number;
}

export interface NetworkMetrics {
  receiveBytesPerSec: number;
  transmitBytesPerSec: number;
  totalBytesPerSec: number;
  activeInterfaces: number;
  interfaces: NetworkInterfaceMetrics[];
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  path: string | null;
  startedAt: string | null;
  user: string | null;
}

export interface SystemHealthSummary {
  status: MetricStatus;
  headline: string;
  summary: string;
  actions: string[];
}

export interface ProcessTotals {
  total: number;
  running: number;
  blocked: number;
  sleeping: number;
  unknown: number;
}

export interface RuntimeMetrics {
  uptimeSeconds: number;
  activeUserSessions: number;
  processTotals: ProcessTotals;
}

export interface MetricsHistoryPoint {
  timestamp: string;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  networkBytesPerSec: number;
  diskReadBytesPerSec: number;
  diskWriteBytesPerSec: number;
  processCount: number;
}

export interface SystemMetricsSnapshot {
  collectedAt: string;
  platform: PlatformKey;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  runtime: RuntimeMetrics;
  topProcesses: ProcessInfo[];
  health: SystemHealthSummary;
  history: MetricsHistoryPoint[];
}

export type WatchdogCategory =
  | 'application'
  | 'system'
  | 'process'
  | 'network'
  | 'storage'
  | 'security';

export interface WatchdogEvent {
  id: string;
  timestamp: string;
  source: WatchdogSourceId;
  category: WatchdogCategory;
  severity: WatchdogSeverity;
  title: string;
  description: string;
  evidence: string[];
  recommendedAction: string;
}

export interface WatchdogEventQuery {
  limit?: number;
  severities?: WatchdogSeverity[];
  categories?: WatchdogCategory[];
  sources?: WatchdogSourceId[];
}

export interface StartupItem {
  id: string;
  name: string;
  command: string;
  location: string;
  enabled: boolean;
  publisher: string | null;
  user?: string | null;
  canDisable: boolean;
  actionSupportReason: string | null;
}

export interface ScheduledTaskSummary {
  name: string;
  path: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  command?: string | null;
  state?: string | null;
}

export interface ServiceSummary {
  name: string;
  displayName: string;
  state: 'running' | 'stopped' | 'paused' | 'unknown';
  startMode: 'automatic' | 'manual' | 'disabled' | 'unknown';
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  startSupportReason: string | null;
  stopSupportReason: string | null;
  restartSupportReason: string | null;
}

export type FixActionKind =
  | 'temp-cleanup'
  | 'kill-process'
  | 'open-process-location'
  | 'start-service'
  | 'stop-service'
  | 'restart-service'
  | 'flush-dns'
  | 'restart-explorer'
  | 'empty-recycle-bin'
  | 'disable-startup-item'
  | 'refresh-diagnostics';

export interface FixActionResult {
  actionId: string;
  kind: FixActionKind;
  success: boolean;
  timestamp: string;
  summary: string;
  details: string[];
}

export interface TempCleanupEntry {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  isDirectory: boolean;
}

export interface TempCleanupPreview {
  previewId: string;
  generatedAt: string;
  roots: string[];
  entries: TempCleanupEntry[];
  totalBytes: number;
  itemCount: number;
  skippedRecentCount: number;
  skippedErrorCount: number;
  notes: string[];
}

export interface PercentThresholds {
  elevated: number;
  stressed: number;
}

export interface NetworkThresholds {
  elevatedBytesPerSec: number;
  stressedBytesPerSec: number;
}

export interface WatchdogMonitorSettings {
  processLaunchMonitoring: boolean;
  startupMonitoring: boolean;
  scheduledTaskMonitoring: boolean;
  securityStatusMonitoring: boolean;
}

export interface AppSettings {
  metricsRefreshIntervalMs: number;
  timelineEventLimit: number;
  theme: 'dark' | 'light' | 'system';
  enableTelemetrySummaries: boolean;
  thresholds: {
    cpu: PercentThresholds;
    memory: PercentThresholds;
    disk: PercentThresholds;
    network: NetworkThresholds;
  };
  monitors: WatchdogMonitorSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  metricsRefreshIntervalMs: 5_000,
  timelineEventLimit: 12,
  theme: 'dark',
  enableTelemetrySummaries: true,
  thresholds: {
    cpu: {
      elevated: 65,
      stressed: 85
    },
    memory: {
      elevated: 72,
      stressed: 88
    },
    disk: {
      elevated: 78,
      stressed: 90
    },
    network: {
      elevatedBytesPerSec: 8 * 1024 * 1024,
      stressedBytesPerSec: 24 * 1024 * 1024
    }
  },
  monitors: {
    processLaunchMonitoring: true,
    startupMonitoring: true,
    scheduledTaskMonitoring: true,
    securityStatusMonitoring: true
  }
};
