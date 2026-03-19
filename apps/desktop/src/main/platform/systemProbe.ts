import type { AppSettings, SystemMetricsSnapshot } from '@shared/models';

export interface SystemProbe {
  collectSnapshot(settings: AppSettings): Promise<SystemMetricsSnapshot>;
}
