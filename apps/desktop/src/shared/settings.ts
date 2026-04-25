import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type NetworkThresholds,
  type PercentThresholds,
  type WatchdogSuppressionRule
} from './models';

const MAX_NETWORK_BYTES_PER_SEC = 500 * 1024 * 1024;

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

const normalizeSuppressions = (
  candidate: WatchdogSuppressionRule[] | undefined
): WatchdogSuppressionRule[] =>
  Array.isArray(candidate)
    ? candidate
        .filter((rule) => typeof rule?.id === 'string' && typeof rule?.value === 'string')
        .map((rule): WatchdogSuppressionRule => ({
          id: rule.id.trim(),
          kind: rule.kind === 'path' ? 'path' : 'fingerprint',
          value: rule.value.trim(),
          label: rule.label?.trim() || rule.value.trim(),
          source: rule.source && rule.source !== 'any' ? rule.source : 'any',
          createdAt: rule.createdAt || new Date().toISOString()
        }))
        .filter((rule) => rule.id && rule.value)
    : [];

export const cloneSettings = (settings: AppSettings): AppSettings =>
  JSON.parse(JSON.stringify(settings)) as AppSettings;

export const normalizeSettings = (candidate: unknown): AppSettings => {
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
    },
    watchdog: {
      showSuppressedEvents:
        typeof parsedSettings?.watchdog?.showSuppressedEvents === 'boolean'
          ? parsedSettings.watchdog.showSuppressedEvents
          : DEFAULT_APP_SETTINGS.watchdog.showSuppressedEvents,
      suppressions: normalizeSuppressions(parsedSettings?.watchdog?.suppressions)
    }
  };
};
