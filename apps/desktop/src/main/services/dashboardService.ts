import type { AppSettings, MetricsHistoryPoint, SystemMetricsSnapshot } from '@shared/models';
import type { SystemProbe } from '@main/platform/systemProbe';
import type { SettingsStore } from '@main/store/settingsStore';

type SnapshotListener = (snapshot: SystemMetricsSnapshot) => void;

const MAX_HISTORY_POINTS = 24;

export class DashboardService {
  private currentSnapshot: SystemMetricsSnapshot | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly listeners = new Set<SnapshotListener>();
  private metricsHistory: MetricsHistoryPoint[] = [];
  private refreshIntervalMs: number;
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly probe: SystemProbe,
    private readonly settingsStore: SettingsStore,
    refreshIntervalMs: number
  ) {
    this.refreshIntervalMs = refreshIntervalMs;
  }

  async initialize(): Promise<void> {
    if (this.currentSnapshot) {
      return;
    }

    await this.runRefreshCycle(false);
  }

  async getSnapshot(): Promise<SystemMetricsSnapshot> {
    if (!this.currentSnapshot) {
      await this.initialize();
    }

    return this.currentSnapshot as SystemMetricsSnapshot;
  }

  start(): void {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      void this.refreshNow().catch((error) => {
        console.error('[dashboard] failed to refresh metrics', error);
      });
    }, this.refreshIntervalMs);
  }

  stop(): void {
    if (!this.refreshTimer) {
      return;
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  updateSettings(settings: AppSettings): void {
    if (settings.metricsRefreshIntervalMs === this.refreshIntervalMs) {
      return;
    }

    this.refreshIntervalMs = settings.metricsRefreshIntervalMs;

    if (this.refreshTimer) {
      this.stop();
      this.start();
    }
  }

  async refreshNow(): Promise<void> {
    await this.runRefreshCycle(true);
  }

  private async runRefreshCycle(notifyListeners: boolean): Promise<void> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        const snapshot = this.attachHistory(
          await this.probe.collectSnapshot(this.settingsStore.getSettings())
        );

        this.currentSnapshot = snapshot;

        if (notifyListeners) {
          this.listeners.forEach((listener) => listener(snapshot));
        }
      })().finally(() => {
          this.refreshInFlight = null;
        });
    }

    await this.refreshInFlight;
  }

  private attachHistory(snapshot: SystemMetricsSnapshot): SystemMetricsSnapshot {
    const nextHistoryPoint: MetricsHistoryPoint = {
      timestamp: snapshot.collectedAt,
      cpuUsagePercent: snapshot.cpu.usagePercent,
      memoryUsagePercent: snapshot.memory.usagePercent,
      diskUsagePercent: snapshot.disk.usagePercent,
      networkBytesPerSec: snapshot.network.totalBytesPerSec,
      diskReadBytesPerSec: snapshot.disk.io.readBytesPerSec,
      diskWriteBytesPerSec: snapshot.disk.io.writeBytesPerSec,
      processCount: snapshot.runtime.processTotals.total
    };

    this.metricsHistory = [...this.metricsHistory, nextHistoryPoint].slice(-MAX_HISTORY_POINTS);

    return {
      ...snapshot,
      history: [...this.metricsHistory]
    };
  }
}
