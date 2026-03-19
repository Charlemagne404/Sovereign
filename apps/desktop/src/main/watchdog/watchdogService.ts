import type { AppSettings, WatchdogEvent } from '@shared/models';
import type { EventStore } from '@main/store/eventStore';

import { ProcessLaunchMonitor } from './process/processLaunchMonitor';
import { ScheduledTaskMonitor } from './scheduledTasks/scheduledTaskMonitor';
import { SecurityMonitor } from './security/securityMonitor';
import { StartupMonitor } from './startup/startupMonitor';
import type { WatchdogMonitor } from './types';

type WatchdogListener = (events: WatchdogEvent[]) => void;

interface MonitorRegistration {
  id: keyof AppSettings['monitors'];
  monitor: WatchdogMonitor;
}

export class WatchdogService {
  private readonly listeners = new Set<WatchdogListener>();
  private readonly monitors: MonitorRegistration[];
  private readonly initializedMonitorIds = new Set<MonitorRegistration['id']>();
  private isRunning = false;

  constructor(
    private readonly eventStore: EventStore,
    private currentSettings: AppSettings
  ) {
    const publish = this.publishEvents.bind(this);

    this.monitors = [
      {
        id: 'processLaunchMonitoring',
        monitor: new ProcessLaunchMonitor(publish)
      },
      {
        id: 'startupMonitoring',
        monitor: new StartupMonitor(publish)
      },
      {
        id: 'scheduledTaskMonitoring',
        monitor: new ScheduledTaskMonitor(publish)
      },
      {
        id: 'securityStatusMonitoring',
        monitor: new SecurityMonitor(publish)
      }
    ];
  }

  async initialize(): Promise<void> {
    await this.syncMonitors();
  }

  start(): void {
    this.isRunning = true;
    void this.syncMonitors();
  }

  async refreshNow(): Promise<void> {
    await this.syncMonitors();

    for (const registration of this.monitors) {
      if (!this.currentSettings.monitors[registration.id]) {
        continue;
      }

      await registration.monitor.refreshNow();
    }
  }

  stop(): void {
    this.isRunning = false;

    for (const registration of this.monitors) {
      registration.monitor.stop();
    }
  }

  async updateSettings(settings: AppSettings): Promise<void> {
    this.currentSettings = settings;
    await this.syncMonitors();
  }

  subscribe(listener: WatchdogListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async publishEvents(
    eventsInput: WatchdogEvent | WatchdogEvent[]
  ): Promise<void> {
    const events = Array.isArray(eventsInput) ? eventsInput : [eventsInput];

    if (events.length === 0) {
      return;
    }

    await this.eventStore.append(events);
    this.listeners.forEach((listener) => listener(events));
  }

  private async syncMonitors(): Promise<void> {
    for (const registration of this.monitors) {
      const isEnabled = this.currentSettings.monitors[registration.id];

      if (!isEnabled) {
        registration.monitor.stop();
        this.initializedMonitorIds.delete(registration.id);
        continue;
      }

      if (!this.initializedMonitorIds.has(registration.id)) {
        await registration.monitor.initialize();
        this.initializedMonitorIds.add(registration.id);
      }

      if (this.isRunning) {
        registration.monitor.start();
      }
    }
  }
}
