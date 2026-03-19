import { randomUUID } from 'node:crypto';

import si from 'systeminformation';

import type { WatchdogEvent } from '@shared/models';
import { analyzeExecutablePath } from '@main/watchdog/rules';
import type {
  EventPublisher,
  ProcessSnapshot,
  WatchdogMonitor
} from '@main/watchdog/types';
import { buildKey, extractCommandPath } from '@main/watchdog/helpers';

const POLL_INTERVAL_MS = 4_000;
const MAX_DETAILED_INFO_EVENTS = 3;

const getRuleLabel = (matchedRule: string | undefined): string => {
  if (matchedRule === 'temp') {
    return 'Temp';
  }

  if (matchedRule === 'downloads') {
    return 'Downloads';
  }

  if (matchedRule === 'appdata') {
    return 'AppData';
  }

  return 'observed location';
};

const createEvent = (
  severity: WatchdogEvent['severity'],
  title: string,
  description: string,
  evidence: string[],
  recommendedAction: string
): WatchdogEvent => ({
  id: randomUUID(),
  timestamp: new Date().toISOString(),
  source: 'process-launch',
  category: 'process',
  severity,
  title,
  description,
  evidence,
  recommendedAction
});

const toProcessSnapshot = (
  process: si.Systeminformation.ProcessesProcessData
): ProcessSnapshot => ({
  key: buildKey(process.pid, process.started, process.path || process.command || process.name),
  pid: process.pid,
  name: process.name || process.command || 'Unknown process',
  path: process.path || null,
  command: process.command || null,
  user: process.user || null,
  startedAt: process.started || null
});

export class ProcessLaunchMonitor implements WatchdogMonitor {
  private knownProcesses = new Map<string, ProcessSnapshot>();
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<void> {
    try {
      const baselineProcesses = await this.captureProcesses();
      this.knownProcesses = new Map(
        baselineProcesses.map((process) => [process.key, process])
      );

      await this.publish(
        createEvent(
          'info',
          'Process launch monitoring armed',
          'New launches will be detected by comparing the live user-space process table at a safe polling interval.',
          [
            `Baseline captured for ${baselineProcesses.length} running processes.`,
            `Polling interval: ${Math.round(POLL_INTERVAL_MS / 1000)} seconds.`,
            'Launches from temp, Downloads, and AppData paths are elevated by explainable heuristics.'
          ],
          'Use informational launches as baseline context and focus on unusual or suspicious launches first.'
        )
      );
    } catch (error) {
      await this.publish(
        createEvent(
          'info',
          'Process launch monitoring is limited',
          'The watchdog could not capture the initial process baseline from the current user-space inventory.',
          [error instanceof Error ? error.message : 'Unknown process inventory error.'],
          'The monitor will keep retrying in the background while the app remains open.'
        )
      );
    }
  }

  start(): void {
    if (this.pollTimer) {
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
    await this.poll();
  }

  private async poll(): Promise<void> {
    try {
      const currentProcesses = await this.captureProcesses();
      const currentProcessMap = new Map(
        currentProcesses.map((process) => [process.key, process])
      );
      const newProcesses = currentProcesses.filter(
        (process) => !this.knownProcesses.has(process.key)
      );

      this.knownProcesses = currentProcessMap;

      if (newProcesses.length === 0) {
        return;
      }

      await this.publish(this.buildLaunchEvents(newProcesses));
      this.reportedFailure = false;
    } catch (error) {
      if (this.reportedFailure) {
        return;
      }

      this.reportedFailure = true;

      await this.publish(
        createEvent(
          'info',
          'Process launch monitor missed a polling cycle',
          'The watchdog could not refresh the process list for one interval.',
          [error instanceof Error ? error.message : 'Unknown process polling error.'],
          'If the issue persists, restart the app and compare with standard OS process tools.'
        )
      );
    }
  }

  private async captureProcesses(): Promise<ProcessSnapshot[]> {
    const processInventory = await si.processes();
    return processInventory.list
      .filter((process) => process.pid > 0)
      .map(toProcessSnapshot);
  }

  private buildLaunchEvents(processes: ProcessSnapshot[]): WatchdogEvent[] {
    const detailedEvents: WatchdogEvent[] = [];
    const informationalProcesses: ProcessSnapshot[] = [];

    for (const process of processes) {
      const executablePath = process.path || extractCommandPath(process.command);
      const pathAssessment = analyzeExecutablePath(executablePath);

      if (pathAssessment.severity === 'info') {
        informationalProcesses.push(process);
        continue;
      }

      detailedEvents.push(
        createEvent(
          pathAssessment.severity,
          `${process.name} launched from ${getRuleLabel(pathAssessment.matchedRules[0])}`,
          'A new process launch matched one or more explainable path heuristics.',
          [
            `PID: ${process.pid}`,
            `Path: ${executablePath || 'Path unavailable'}`,
            ...(process.user ? [`User: ${process.user}`] : []),
            ...pathAssessment.reasons
          ],
          pathAssessment.recommendedAction
        )
      );
    }

    if (informationalProcesses.length <= MAX_DETAILED_INFO_EVENTS) {
      for (const process of informationalProcesses) {
        detailedEvents.push(
          createEvent(
            'info',
            `Process launched: ${process.name}`,
            'A new process appeared in the user-space inventory and did not match the current path heuristics.',
            [
              `PID: ${process.pid}`,
              `Path: ${
                process.path || extractCommandPath(process.command) || 'Path unavailable'
              }`,
              ...(process.user ? [`User: ${process.user}`] : []),
              'Path did not match the current temp, Downloads, or AppData heuristics.'
            ],
            'Treat this as baseline activity unless the process name or timing still looks wrong.'
          )
        );
      }

      return detailedEvents;
    }

    detailedEvents.push(
      createEvent(
        'info',
        'Multiple new processes observed',
        'Several new launches were detected during the last polling interval and none matched the current suspicious path heuristics.',
        [
          `Launch count: ${informationalProcesses.length}`,
          `Examples: ${informationalProcesses
            .slice(0, 5)
            .map((process) => process.name)
            .join(', ')}`
        ],
        'Use the filters to focus on unusual or suspicious activity first, then inspect the process table for more detail.'
      )
    );

    return detailedEvents;
  }
}
