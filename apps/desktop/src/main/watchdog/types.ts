import type {
  ScheduledTaskSummary,
  StartupItem,
  WatchdogEvent
} from '@shared/models';

export interface WatchdogMonitor {
  initialize(): Promise<void>;
  start(): void;
  stop(): void;
  refreshNow(): Promise<void>;
}

export type EventPublisher = (
  events: WatchdogEvent | WatchdogEvent[]
) => Promise<void>;

export interface ProcessSnapshot {
  key: string;
  pid: number;
  name: string;
  path: string | null;
  command: string | null;
  user: string | null;
  startedAt: string | null;
}

export interface StartupItemRecord extends StartupItem {
  sourceType: 'registry' | 'folder';
  registryHive: string | null;
  registryPath: string | null;
  valueName: string | null;
  filePath: string | null;
  user: string | null;
}

export interface ScheduledTaskRecord extends ScheduledTaskSummary {
  command: string | null;
  state: string | null;
}

export interface DefenderStatusSnapshot {
  available: boolean;
  antivirusEnabled: boolean | null;
  realTimeProtectionEnabled: boolean | null;
  behaviorMonitorEnabled: boolean | null;
  ioavProtectionEnabled: boolean | null;
  antispywareEnabled: boolean | null;
  serviceEnabled: boolean | null;
  error: string | null;
}

export interface FirewallProfileSnapshot {
  name: string;
  enabled: boolean | null;
  defaultInboundAction: string | null;
  defaultOutboundAction: string | null;
  error: string | null;
}

export interface SecurityStatusSnapshot {
  defender: DefenderStatusSnapshot | null;
  firewallProfiles: FirewallProfileSnapshot[];
  checkedAt: string;
}
