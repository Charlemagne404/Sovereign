import { randomUUID } from 'node:crypto';

import type { WatchdogEvent } from '@shared/models';
import { analyzeExecutablePath, maxSeverity } from '@main/watchdog/rules';
import type {
  EventPublisher,
  ScheduledTaskRecord,
  WatchdogMonitor
} from '@main/watchdog/types';
import { buildKey } from '@main/watchdog/helpers';

import { WindowsScheduledTaskProvider } from './windowsScheduledTaskProvider';

const POLL_INTERVAL_MS = 180_000;

const createEvent = (
  severity: WatchdogEvent['severity'],
  title: string,
  description: string,
  evidence: string[],
  recommendedAction: string
): WatchdogEvent => ({
  id: randomUUID(),
  timestamp: new Date().toISOString(),
  source: 'scheduled-tasks',
  category: 'security',
  severity,
  title,
  description,
  evidence,
  recommendedAction
});

const getIdentity = (task: ScheduledTaskRecord): string =>
  buildKey(task.path, task.name);

const getTaskSignature = (task: ScheduledTaskRecord): string =>
  buildKey(task.command, task.enabled, task.state, task.nextRunAt);

export class ScheduledTaskMonitor implements WatchdogMonitor {
  private readonly provider = new WindowsScheduledTaskProvider();
  private knownTasks = new Map<string, ScheduledTaskRecord>();
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<void> {
    if (process.platform !== 'win32') {
      await this.publish(
        createEvent(
          'info',
          'Scheduled task inventory is Windows-only',
          'Scheduled task summaries currently rely on Windows Task Scheduler commands and are unavailable on this platform.',
          ['Current platform is not Windows.', 'Task action paths and run times are only collected when Windows exposes them.'],
          'Run Sovereign on Windows 11 to inventory and compare scheduled tasks.'
        )
      );
      return;
    }

    try {
      const tasks = await this.provider.list();
      this.knownTasks = new Map(tasks.map((task) => [getIdentity(task), task]));

      const inventoryEvent = createEvent(
        'info',
        'Scheduled task inventory captured',
        'The watchdog recorded visible scheduled task summaries and will compare them for changes over time.',
        [
          `Observed tasks: ${tasks.length}`,
          'Source: Get-ScheduledTask and Get-ScheduledTaskInfo',
          'Some task details can still be limited by Windows permissions.'
        ],
        'Review newly added or changed tasks carefully if they point into user-writable paths.'
      );

      const flaggedTasks = tasks
        .map((task) => this.createHeuristicEvent(task, 'Current scheduled task matches a path heuristic'))
        .filter((event): event is WatchdogEvent => event !== null);

      await this.publish([inventoryEvent, ...flaggedTasks]);
    } catch (error) {
      await this.publish(
        createEvent(
          'info',
          'Scheduled task inventory could not be read',
          'The watchdog could not read scheduled task summaries from the current Windows source.',
          [error instanceof Error ? error.message : 'Unknown scheduled task inventory error.'],
          'Some environments restrict scheduled task inspection. Compare with Task Scheduler if needed.'
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
      const tasks = await this.provider.list();
      const nextTasks = new Map(tasks.map((task) => [getIdentity(task), task]));
      const events: WatchdogEvent[] = [];

      for (const [identity, task] of nextTasks.entries()) {
        const previousTask = this.knownTasks.get(identity);

        if (!previousTask) {
          events.push(this.createAddedEvent(task));
          continue;
        }

        if (getTaskSignature(previousTask) !== getTaskSignature(task)) {
          events.push(this.createChangedEvent(previousTask, task));
        }
      }

      for (const [identity, previousTask] of this.knownTasks.entries()) {
        if (!nextTasks.has(identity)) {
          events.push(
            createEvent(
              'info',
              `Scheduled task removed: ${previousTask.path}${previousTask.name}`,
              'A previously observed scheduled task is no longer present in the latest inventory.',
              [
                `Task path: ${previousTask.path}`,
                `Command: ${previousTask.command || 'Unavailable'}`
              ],
              'Confirm that the removal matches an intentional cleanup or software uninstall.'
            )
          );
        }
      }

      this.knownTasks = nextTasks;

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
          'Scheduled task inventory refresh missed a polling cycle',
          'The watchdog could not refresh scheduled task summaries for one interval.',
          [error instanceof Error ? error.message : 'Unknown scheduled task polling error.'],
          'The monitor will retry automatically. Compare with Task Scheduler if you need immediate confirmation.'
        )
      );
    }
  }

  private createAddedEvent(task: ScheduledTaskRecord): WatchdogEvent {
    const pathAssessment = analyzeExecutablePath(task.command);

    return createEvent(
      pathAssessment.severity,
      `Scheduled task added: ${task.path}${task.name}`,
      'A new scheduled task appeared in the Windows task inventory.',
      [
        `Task path: ${task.path}`,
        `Command: ${task.command || 'Unavailable'}`,
        `Enabled: ${task.enabled ? 'yes' : 'no'}`,
        ...(task.nextRunAt ? [`Next run: ${task.nextRunAt}`] : []),
        ...pathAssessment.reasons
      ],
      pathAssessment.recommendedAction
    );
  }

  private createChangedEvent(
    previousTask: ScheduledTaskRecord,
    nextTask: ScheduledTaskRecord
  ): WatchdogEvent {
    const pathAssessment = analyzeExecutablePath(nextTask.command);
    const severity = maxSeverity('unusual', pathAssessment.severity);

    return createEvent(
      severity,
      `Scheduled task changed: ${nextTask.path}${nextTask.name}`,
      'An existing scheduled task changed command or state in the latest Windows inventory.',
      [
        `Task path: ${nextTask.path}`,
        `Previous command: ${previousTask.command || 'Unavailable'}`,
        `Current command: ${nextTask.command || 'Unavailable'}`,
        `Current state: ${nextTask.state || 'Unknown'}`,
        ...pathAssessment.reasons
      ],
      'Confirm that the task change was intentional, especially if it now points into a user-writable path.'
    );
  }

  private createHeuristicEvent(
    task: ScheduledTaskRecord,
    title: string
  ): WatchdogEvent | null {
    const pathAssessment = analyzeExecutablePath(task.command);

    if (pathAssessment.severity === 'info') {
      return null;
    }

    return createEvent(
      pathAssessment.severity,
      `${title}: ${task.path}${task.name}`,
      'An observed scheduled task already points into a path that matches one or more explainable heuristics.',
      [
        `Command: ${task.command || 'Unavailable'}`,
        `Task path: ${task.path}`,
        ...pathAssessment.reasons
      ],
      pathAssessment.recommendedAction
    );
  }
}
