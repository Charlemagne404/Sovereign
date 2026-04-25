import type {
  ScheduledTaskSummary,
  StartupItem,
  WatchdogEvent
} from '@shared/models';

export interface WatchdogMonitor {
  initialize(): Promise<WatchdogMonitorInitializationResult | void>;
  start(): void;
  stop(): void;
  refreshNow(): Promise<void>;
}

export interface WatchdogMonitorInitializationResult {
  baselineItemCount?: number | null;
  note?: string | null;
}

export type EventPublisher = (
  events: WatchdogEvent | WatchdogEvent[]
) => Promise<void>;

export interface ProcessSnapshot {
  key: string;
  pid: number;
  parentPid: number | null;
  name: string;
  path: string | null;
  command: string | null;
  user: string | null;
  startedAt: string | null;
  observedAt?: string | null;
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

export interface GatekeeperStatusSnapshot {
  available: boolean;
  assessmentsEnabled: boolean | null;
  error: string | null;
}

export interface ApplicationFirewallSnapshot {
  available: boolean;
  enabled: boolean | null;
  stealthModeEnabled: boolean | null;
  blockAllIncomingEnabled: boolean | null;
  error: string | null;
}

export interface SecurityStatusSnapshot {
  defender: DefenderStatusSnapshot | null;
  gatekeeper: GatekeeperStatusSnapshot | null;
  firewallProfiles: FirewallProfileSnapshot[];
  applicationFirewall: ApplicationFirewallSnapshot | null;
  checkedAt: string;
}
