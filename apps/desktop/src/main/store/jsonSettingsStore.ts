import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type NetworkThresholds,
  type PercentThresholds
} from '@shared/models';

import type { SettingsStore } from './settingsStore';

interface SettingsStoreFile {
  version: 1;
  settings: AppSettings;
}

const SETTINGS_VERSION = 1 as const;
const MAX_NETWORK_BYTES_PER_SEC = 500 * 1024 * 1024;

const isNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const cloneSettings = (settings: AppSettings): AppSettings =>
  JSON.parse(JSON.stringify(settings)) as AppSettings;

const clampNumber = (
  candidate: unknown,
  minValue: number,
  maxValue: number,
  fallbackValue: number
): number => {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return fallbackValue;
  }

  return Math.min(maxValue, Math.max(minValue, Math.round(candidate)));
};

const normalizePercentThresholds = (
  candidate: Partial<PercentThresholds> | undefined,
  fallback: PercentThresholds
): PercentThresholds => {
  const elevated = clampNumber(candidate?.elevated, 1, 98, fallback.elevated);
  const stressed = clampNumber(candidate?.stressed, elevated + 1, 100, fallback.stressed);

  return {
    elevated,
    stressed: Math.max(stressed, elevated + 1)
  };
};

const normalizeNetworkThresholds = (
  candidate: Partial<NetworkThresholds> | undefined,
  fallback: NetworkThresholds
): NetworkThresholds => {
  const elevatedBytesPerSec = clampNumber(
    candidate?.elevatedBytesPerSec,
    64 * 1024,
    MAX_NETWORK_BYTES_PER_SEC - 1,
    fallback.elevatedBytesPerSec
  );
  const stressedBytesPerSec = clampNumber(
    candidate?.stressedBytesPerSec,
    elevatedBytesPerSec + 1,
    MAX_NETWORK_BYTES_PER_SEC,
    fallback.stressedBytesPerSec
  );

  return {
    elevatedBytesPerSec,
    stressedBytesPerSec: Math.max(stressedBytesPerSec, elevatedBytesPerSec + 1)
  };
};

const normalizeSettings = (candidate: unknown): AppSettings => {
  const parsedSettings = candidate as Partial<AppSettings> | undefined;

  return {
    metricsRefreshIntervalMs: clampNumber(
      parsedSettings?.metricsRefreshIntervalMs,
      1_000,
      60_000,
      DEFAULT_APP_SETTINGS.metricsRefreshIntervalMs
    ),
    timelineEventLimit: clampNumber(
      parsedSettings?.timelineEventLimit,
      5,
      50,
      DEFAULT_APP_SETTINGS.timelineEventLimit
    ),
    theme:
      parsedSettings?.theme === 'light' ||
      parsedSettings?.theme === 'system' ||
      parsedSettings?.theme === 'dark'
        ? parsedSettings.theme
        : DEFAULT_APP_SETTINGS.theme,
    enableTelemetrySummaries:
      typeof parsedSettings?.enableTelemetrySummaries === 'boolean'
        ? parsedSettings.enableTelemetrySummaries
        : DEFAULT_APP_SETTINGS.enableTelemetrySummaries,
    thresholds: {
      cpu: normalizePercentThresholds(
        parsedSettings?.thresholds?.cpu,
        DEFAULT_APP_SETTINGS.thresholds.cpu
      ),
      memory: normalizePercentThresholds(
        parsedSettings?.thresholds?.memory,
        DEFAULT_APP_SETTINGS.thresholds.memory
      ),
      disk: normalizePercentThresholds(
        parsedSettings?.thresholds?.disk,
        DEFAULT_APP_SETTINGS.thresholds.disk
      ),
      network: normalizeNetworkThresholds(
        parsedSettings?.thresholds?.network,
        DEFAULT_APP_SETTINGS.thresholds.network
      )
    },
    monitors: {
      processLaunchMonitoring:
        typeof parsedSettings?.monitors?.processLaunchMonitoring === 'boolean'
          ? parsedSettings.monitors.processLaunchMonitoring
          : DEFAULT_APP_SETTINGS.monitors.processLaunchMonitoring,
      startupMonitoring:
        typeof parsedSettings?.monitors?.startupMonitoring === 'boolean'
          ? parsedSettings.monitors.startupMonitoring
          : DEFAULT_APP_SETTINGS.monitors.startupMonitoring,
      scheduledTaskMonitoring:
        typeof parsedSettings?.monitors?.scheduledTaskMonitoring === 'boolean'
          ? parsedSettings.monitors.scheduledTaskMonitoring
          : DEFAULT_APP_SETTINGS.monitors.scheduledTaskMonitoring,
      securityStatusMonitoring:
        typeof parsedSettings?.monitors?.securityStatusMonitoring === 'boolean'
          ? parsedSettings.monitors.securityStatusMonitoring
          : DEFAULT_APP_SETTINGS.monitors.securityStatusMonitoring
    }
  };
};

export class JsonSettingsStore implements SettingsStore {
  private currentSettings = cloneSettings(DEFAULT_APP_SETTINGS);

  constructor(private readonly storePath: string) {}

  async initialize(): Promise<void> {
    const currentStore = await this.readStore();
    this.currentSettings = currentStore.settings;
  }

  getSettings(): AppSettings {
    return cloneSettings(this.currentSettings);
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    this.currentSettings = normalizeSettings(settings);
    await this.writeStore({
      version: SETTINGS_VERSION,
      settings: this.currentSettings
    });

    return this.getSettings();
  }

  private async readStore(): Promise<SettingsStoreFile> {
    await mkdir(path.dirname(this.storePath), { recursive: true });

    try {
      const rawStore = await readFile(this.storePath, 'utf8');
      const parsedStore = JSON.parse(rawStore) as Partial<SettingsStoreFile>;
      const settings = normalizeSettings(parsedStore.settings);

      return {
        version: SETTINGS_VERSION,
        settings
      };
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.warn('[settings] failed to read settings store, rewriting defaults', error);
      }

      const defaultStore = {
        version: SETTINGS_VERSION,
        settings: cloneSettings(DEFAULT_APP_SETTINGS)
      };
      await this.writeStore(defaultStore);
      return defaultStore;
    }
  }

  private async writeStore(store: SettingsStoreFile): Promise<void> {
    await writeFile(this.storePath, JSON.stringify(store, null, 2), 'utf8');
  }
}
