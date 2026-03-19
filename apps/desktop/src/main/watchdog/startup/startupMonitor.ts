import { randomUUID } from 'node:crypto';

import type { WatchdogEvent } from '@shared/models';
import { analyzeExecutablePath, maxSeverity } from '@main/watchdog/rules';
import type {
  EventPublisher,
  StartupItemRecord,
  WatchdogMonitor
} from '@main/watchdog/types';
import { buildKey, extractCommandPath } from '@main/watchdog/helpers';

import { WindowsStartupItemsProvider } from './windowsStartupItemsProvider';

const POLL_INTERVAL_MS = 120_000;

const createEvent = (
  severity: WatchdogEvent['severity'],
  title: string,
  description: string,
  evidence: string[],
  recommendedAction: string
): WatchdogEvent => ({
  id: randomUUID(),
  timestamp: new Date().toISOString(),
  source: 'startup-items',
  category: 'security',
  severity,
  title,
  description,
  evidence,
  recommendedAction
});

const getIdentity = (item: StartupItemRecord): string =>
  buildKey(item.name, item.location, item.user);

const getCommandSignature = (item: StartupItemRecord): string =>
  buildKey(item.command, item.enabled);

export class StartupMonitor implements WatchdogMonitor {
  private readonly provider = new WindowsStartupItemsProvider();
  private knownItems = new Map<string, StartupItemRecord>();
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;
  private pollInFlight: Promise<void> | null = null;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<void> {
    if (process.platform !== 'win32') {
      await this.publish(
        createEvent(
          'info',
          'Startup inventory is Windows-only',
          'Startup item monitoring currently uses the Windows startup command inventory and is unavailable on this platform.',
          ['Current platform is not Windows.', 'Disabled startup entries are only observable through Windows-specific sources.'],
          'Run Sovereign on Windows 11 to capture and compare startup items.'
        )
      );
      return;
    }

    try {
      const startupItems = await this.provider.list();
      this.knownItems = new Map(
        startupItems.map((item) => [getIdentity(item), item])
      );

      const inventoryEvent = createEvent(
        'info',
        'Startup inventory captured',
        'The watchdog recorded the current startup entries and will compare them for changes over time.',
        [
          `Observed startup items: ${startupItems.length}`,
          'Source: Win32_StartupCommand',
          'Disabled startup entries may not be visible through this source.'
        ],
        'Review unexpected startup entries carefully, especially if they point into user-writable paths.'
      );

      const flaggedItems = startupItems
        .map((item) => this.createHeuristicEvent(item, 'Current startup item matches a path heuristic'))
        .filter((event): event is WatchdogEvent => event !== null);

      await this.publish([inventoryEvent, ...flaggedItems]);
    } catch (error) {
      await this.publish(
        createEvent(
          'info',
          'Startup inventory could not be read',
          'The watchdog could not read startup items from the current Windows source.',
          [error instanceof Error ? error.message : 'Unknown startup inventory error.'],
          'Some environments restrict or reshape startup data. Compare with Task Manager startup entries if needed.'
        )
      );
    }
  }

  start(): void {
    if (process.platform !== 'win32' || this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.runPoll();
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

    await this.runPoll();
  }

  private async runPoll(): Promise<void> {
    if (!this.pollInFlight) {
      this.pollInFlight = this.poll().finally(() => {
        this.pollInFlight = null;
      });
    }

    await this.pollInFlight;
  }

  private async poll(): Promise<void> {
    try {
      const startupItems = await this.provider.list();
      const nextItems = new Map(startupItems.map((item) => [getIdentity(item), item]));
      const events: WatchdogEvent[] = [];

      for (const [identity, item] of nextItems.entries()) {
        const previousItem = this.knownItems.get(identity);

        if (!previousItem) {
          events.push(this.createAddedEvent(item));
          continue;
        }

        if (getCommandSignature(previousItem) !== getCommandSignature(item)) {
          events.push(this.createChangedEvent(previousItem, item));
        }
      }

      for (const [identity, previousItem] of this.knownItems.entries()) {
        if (!nextItems.has(identity)) {
          events.push(
            createEvent(
              'info',
              `Startup item removed: ${previousItem.name}`,
              'A previously observed startup entry is no longer present in the latest inventory.',
              [
                `Location: ${previousItem.location}`,
                `Command: ${previousItem.command || 'Unavailable'}`
              ],
              'Confirm that the removal matches an intentional uninstall or configuration change.'
            )
          );
        }
      }

      this.knownItems = nextItems;

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
          'info',
          'Startup inventory refresh missed a polling cycle',
          'The watchdog could not refresh startup items for one interval.',
          [error instanceof Error ? error.message : 'Unknown startup polling error.'],
          'The monitor will retry automatically. Compare with Task Manager if changes are urgent.'
        )
      );
    }
  }

  private createAddedEvent(item: StartupItemRecord): WatchdogEvent {
    const pathAssessment = analyzeExecutablePath(extractCommandPath(item.command));

    return createEvent(
      pathAssessment.severity,
      `Startup item added: ${item.name}`,
      'A new startup entry appeared in the Windows startup inventory.',
      [
        `Location: ${item.location}`,
        `Command: ${item.command || 'Unavailable'}`,
        ...(item.user ? [`User: ${item.user}`] : []),
        ...pathAssessment.reasons
      ],
      pathAssessment.recommendedAction
    );
  }

  private createChangedEvent(
    previousItem: StartupItemRecord,
    nextItem: StartupItemRecord
  ): WatchdogEvent {
    const pathAssessment = analyzeExecutablePath(extractCommandPath(nextItem.command));
    const severity = maxSeverity('unusual', pathAssessment.severity);

    return createEvent(
      severity,
      `Startup item changed: ${nextItem.name}`,
      'An existing startup entry changed command or enabled state in the latest Windows inventory.',
      [
        `Location: ${nextItem.location}`,
        `Previous command: ${previousItem.command || 'Unavailable'}`,
        `Current command: ${nextItem.command || 'Unavailable'}`,
        ...pathAssessment.reasons
      ],
      'Confirm that the startup change was intentional, especially if it now points into a user-writable path.'
    );
  }

  private createHeuristicEvent(
    item: StartupItemRecord,
    title: string
  ): WatchdogEvent | null {
    const pathAssessment = analyzeExecutablePath(extractCommandPath(item.command));

    if (pathAssessment.severity === 'info') {
      return null;
    }

    return createEvent(
      pathAssessment.severity,
      `${title}: ${item.name}`,
      'An observed startup entry already points into a path that matches one or more explainable heuristics.',
      [
        `Location: ${item.location}`,
        `Command: ${item.command || 'Unavailable'}`,
        ...pathAssessment.reasons
      ],
      pathAssessment.recommendedAction
    );
  }
}
