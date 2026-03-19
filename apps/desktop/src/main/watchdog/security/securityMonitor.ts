import { randomUUID } from 'node:crypto';

import type { WatchdogEvent } from '@shared/models';
import type {
  DefenderStatusSnapshot,
  EventPublisher,
  FirewallProfileSnapshot,
  SecurityStatusSnapshot,
  WatchdogMonitor
} from '@main/watchdog/types';

import { WindowsSecurityStatusProvider } from './windowsSecurityStatusProvider';

const POLL_INTERVAL_MS = 90_000;

const createEvent = (
  source: WatchdogEvent['source'],
  severity: WatchdogEvent['severity'],
  title: string,
  description: string,
  evidence: string[],
  recommendedAction: string
): WatchdogEvent => ({
  id: randomUUID(),
  timestamp: new Date().toISOString(),
  source,
  category: 'security',
  severity,
  title,
  description,
  evidence,
  recommendedAction
});

const getDefenderSignature = (status: DefenderStatusSnapshot | null): string =>
  JSON.stringify(status);

const getFirewallSignature = (profiles: FirewallProfileSnapshot[]): string =>
  JSON.stringify(
    profiles.map((profile) => ({
      name: profile.name,
      enabled: profile.enabled,
      defaultInboundAction: profile.defaultInboundAction,
      defaultOutboundAction: profile.defaultOutboundAction,
      error: profile.error
    }))
  );

const createDefenderEvent = (
  defenderStatus: DefenderStatusSnapshot | null,
  hasPreviousSnapshot: boolean
): WatchdogEvent => {
  if (!defenderStatus || !defenderStatus.available) {
    return createEvent(
      'defender-status',
      'info',
      hasPreviousSnapshot
        ? 'Defender status is no longer readable'
        : 'Defender status could not be read',
      'Sovereign could not confirm Microsoft Defender status from the current Windows command surface.',
      [
        defenderStatus?.error || 'The Defender PowerShell cmdlet was unavailable.',
        'This does not prove that the device is unprotected.'
      ],
      'Compare with Windows Security or other endpoint protection tools before drawing conclusions.'
    );
  }

  const disabledCoreProtections =
    defenderStatus.antivirusEnabled === false ||
    defenderStatus.realTimeProtectionEnabled === false;
  const disabledSecondaryProtections =
    defenderStatus.behaviorMonitorEnabled === false ||
    defenderStatus.ioavProtectionEnabled === false ||
    defenderStatus.antispywareEnabled === false ||
    defenderStatus.serviceEnabled === false;

  if (disabledCoreProtections) {
    return createEvent(
      'defender-status',
      'suspicious',
      hasPreviousSnapshot ? 'Defender protection changed' : 'Defender protection appears reduced',
      'One or more core Defender protections are reported as disabled.',
      [
        `Antivirus enabled: ${defenderStatus.antivirusEnabled ? 'yes' : 'no'}`,
        `Real-time protection: ${
          defenderStatus.realTimeProtectionEnabled ? 'yes' : 'no'
        }`,
        `Service enabled: ${defenderStatus.serviceEnabled ? 'yes' : 'no'}`
      ],
      'Confirm whether this reduction was intentional or whether another security product replaced these protections.'
    );
  }

  if (disabledSecondaryProtections) {
    return createEvent(
      'defender-status',
      'unusual',
      hasPreviousSnapshot ? 'Defender status changed' : 'Defender status shows partial coverage',
      'Microsoft Defender is readable, but one or more secondary protections are reported as disabled.',
      [
        `Behavior monitoring: ${
          defenderStatus.behaviorMonitorEnabled ? 'yes' : 'no'
        }`,
        `IOAV protection: ${defenderStatus.ioavProtectionEnabled ? 'yes' : 'no'}`,
        `Antispyware: ${defenderStatus.antispywareEnabled ? 'yes' : 'no'}`
      ],
      'Review the current Windows Security configuration and confirm whether these settings are expected.'
    );
  }

  return createEvent(
    'defender-status',
    'info',
    hasPreviousSnapshot ? 'Defender status refreshed' : 'Defender status looks healthy',
    'Microsoft Defender reported its core protections as enabled at the last check.',
    [
      `Antivirus enabled: ${defenderStatus.antivirusEnabled ? 'yes' : 'no'}`,
      `Real-time protection: ${
        defenderStatus.realTimeProtectionEnabled ? 'yes' : 'no'
      }`,
      `Behavior monitoring: ${
        defenderStatus.behaviorMonitorEnabled ? 'yes' : 'no'
      }`
    ],
    'Treat this as a current status snapshot rather than a guarantee about every security control on the device.'
  );
};

const createFirewallEvent = (
  firewallProfiles: FirewallProfileSnapshot[],
  hasPreviousSnapshot: boolean
): WatchdogEvent => {
  if (firewallProfiles.length === 0 || firewallProfiles.every((profile) => profile.error)) {
    return createEvent(
      'firewall-status',
      'info',
      hasPreviousSnapshot
        ? 'Firewall status is no longer readable'
        : 'Firewall status could not be read',
      'Sovereign could not confirm Windows Firewall profile states from the current Windows command surface.',
      [
        firewallProfiles[0]?.error || 'The firewall PowerShell cmdlet was unavailable.',
        'This does not prove that the firewall is disabled.'
      ],
      'Compare with Windows Defender Firewall settings before drawing conclusions.'
    );
  }

  const disabledProfiles = firewallProfiles.filter((profile) => profile.enabled === false);

  if (disabledProfiles.length === firewallProfiles.length && firewallProfiles.length > 0) {
    return createEvent(
      'firewall-status',
      'suspicious',
      hasPreviousSnapshot ? 'Firewall profile state changed' : 'Firewall appears broadly disabled',
      'All readable firewall profiles are currently reported as disabled.',
      disabledProfiles.map(
        (profile) =>
          `${profile.name}: disabled (inbound ${profile.defaultInboundAction || 'unknown'}, outbound ${profile.defaultOutboundAction || 'unknown'})`
      ),
      'Confirm whether this is intentional. A fully disabled firewall is uncommon on a managed Windows desktop.'
    );
  }

  if (disabledProfiles.length > 0) {
    return createEvent(
      'firewall-status',
      'unusual',
      hasPreviousSnapshot ? 'Firewall profile state changed' : 'One or more firewall profiles are disabled',
      'At least one readable firewall profile is currently reported as disabled.',
      firewallProfiles.map(
        (profile) =>
          `${profile.name}: ${
            profile.enabled ? 'enabled' : 'disabled'
          } (inbound ${profile.defaultInboundAction || 'unknown'}, outbound ${
            profile.defaultOutboundAction || 'unknown'
          })`
      ),
      'Review the firewall profile configuration and confirm whether the disabled profile is expected.'
    );
  }

  return createEvent(
    'firewall-status',
    'info',
    hasPreviousSnapshot ? 'Firewall status refreshed' : 'Firewall profiles look enabled',
    'Readable Windows Firewall profiles were reported as enabled at the last check.',
    firewallProfiles.map(
      (profile) =>
        `${profile.name}: enabled (inbound ${profile.defaultInboundAction || 'unknown'}, outbound ${
          profile.defaultOutboundAction || 'unknown'
        })`
    ),
    'Treat this as a current status snapshot and re-check if the network posture changes later.'
  );
};

export class SecurityMonitor implements WatchdogMonitor {
  private readonly provider = new WindowsSecurityStatusProvider();
  private currentSnapshot: SecurityStatusSnapshot | null = null;
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<void> {
    if (process.platform !== 'win32') {
      await this.publish([
        createEvent(
          'defender-status',
          'info',
          'Defender status is Windows-only',
          'Microsoft Defender status reads currently rely on Windows-specific PowerShell cmdlets and are unavailable on this platform.',
          ['Current platform is not Windows.'],
          'Run Sovereign on Windows 11 to read Defender status from the local system.'
        ),
        createEvent(
          'firewall-status',
          'info',
          'Firewall status is Windows-only',
          'Windows Firewall profile reads currently rely on Windows-specific PowerShell cmdlets and are unavailable on this platform.',
          ['Current platform is not Windows.'],
          'Run Sovereign on Windows 11 to read local firewall profile status.'
        )
      ]);
      return;
    }

    try {
      this.currentSnapshot = await this.provider.read();
      await this.publish(this.createEvents(this.currentSnapshot, false));
    } catch (error) {
      await this.publish(
        createEvent(
          'defender-status',
          'info',
          'Security status could not be read',
          'The watchdog could not read Defender or firewall status from the current Windows sources.',
          [error instanceof Error ? error.message : 'Unknown security status error.'],
          'Compare with Windows Security and Windows Defender Firewall if current protection state matters.'
        )
      );
    }
  }

  start(): void {
    if (process.platform !== 'win32' || this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async refreshNow(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    await this.poll();
  }

  private async poll(): Promise<void> {
    try {
      const nextSnapshot = await this.provider.read();
      const previousSnapshot = this.currentSnapshot;
      const events: WatchdogEvent[] = [];

      if (
        !previousSnapshot ||
        getDefenderSignature(previousSnapshot.defender) !==
          getDefenderSignature(nextSnapshot.defender)
      ) {
        events.push(createDefenderEvent(nextSnapshot.defender, Boolean(previousSnapshot)));
      }

      if (
        !previousSnapshot ||
        getFirewallSignature(previousSnapshot.firewallProfiles) !==
          getFirewallSignature(nextSnapshot.firewallProfiles)
      ) {
        events.push(
          createFirewallEvent(nextSnapshot.firewallProfiles, Boolean(previousSnapshot))
        );
      }

      this.currentSnapshot = nextSnapshot;

      if (events.length > 0) {
        await this.publish(events);
      }

      this.reportedFailure = false;
    } catch (error) {
      if (this.reportedFailure) {
        return;
      }

      this.reportedFailure = true;

      await this.publish(
        createEvent(
          'defender-status',
          'info',
          'Security status refresh missed a polling cycle',
          'The watchdog could not refresh Defender or firewall status for one interval.',
          [error instanceof Error ? error.message : 'Unknown security polling error.'],
          'The monitor will retry automatically. Use Windows Security if you need an immediate answer.'
        )
      );
    }
  }

  private createEvents(
    snapshot: SecurityStatusSnapshot,
    hasPreviousSnapshot: boolean
  ): WatchdogEvent[] {
    return [
      createDefenderEvent(snapshot.defender, hasPreviousSnapshot),
      createFirewallEvent(snapshot.firewallProfiles, hasPreviousSnapshot)
    ];
  }
}
