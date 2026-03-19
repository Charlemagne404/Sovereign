import type { AppSettings } from '@shared/models';

export interface SettingsStore {
  initialize(): Promise<void>;
  getSettings(): AppSettings;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
}
