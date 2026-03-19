import type { MetricsHistoryPoint, SystemMetricsSnapshot } from '@shared/models';
import type { SystemProbe } from '@main/platform/systemProbe';
import type { SettingsStore } from '@main/store/settingsStore';

type SnapshotListener = (snapshot: SystemMetricsSnapshot) => void;

const MAX_HISTORY_POINTS = 24;

export class DashboardService {
  private currentSnapshot: SystemMetricsSnapshot | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly listeners = new Set<SnapshotListener>();
  private metricsHistory: MetricsHistoryPoint[] = [];

  constructor(
    private readonly probe: SystemProbe,
    private readonly settingsStore: SettingsStore,
    private readonly refreshIntervalMs: number
  ) {}

  async initialize(): Promise<void> {
    const snapshot = await this.collectSnapshot();
    this.currentSnapshot = this.attachHistory(snapshot);
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
      void this.refreshNow();
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

  async refreshNow(): Promise<void> {
    try {
      const snapshot = this.attachHistory(await this.collectSnapshot());
      this.currentSnapshot = snapshot;
      this.listeners.forEach((listener) => listener(snapshot));
    } catch (error) {
      console.error('[dashboard] failed to refresh metrics', error);
    }
  }

  private async collectSnapshot(): Promise<SystemMetricsSnapshot> {
    return this.probe.collectSnapshot(this.settingsStore.getSettings());
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
