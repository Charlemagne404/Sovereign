const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const integerFormatter = new Intl.NumberFormat();
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto'
});

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  );
  const value = bytes / 1024 ** unitIndex;
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(digits)} ${BYTE_UNITS[unitIndex]}`;
};

export const formatRate = (bytesPerSecond: number): string =>
  `${formatBytes(bytesPerSecond)}/s`;

export const formatCount = (value: number): string =>
  integerFormatter.format(Math.max(0, Math.round(value)));

export const formatPercentage = (value: number): string => `${Math.round(value)}%`;

export const formatDuration = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0m';
  }

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
};

export const formatGigahertz = (value: number | null): string => {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 'Unavailable';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} GHz`;
};

export const formatTemperature = (value: number | null): string => {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 'Unavailable';
  }

  return `${Math.round(value)} C`;
};

export const formatClock = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

export const formatRelativeTime = (timestamp: string | null): string => {
  if (!timestamp) {
    return 'Unavailable';
  }

  const deltaMs = new Date(timestamp).getTime() - Date.now();
  const deltaMinutes = Math.round(deltaMs / 60_000);

  if (Math.abs(deltaMinutes) < 1) {
    return 'just now';
  }

  if (Math.abs(deltaMinutes) < 60) {
    return relativeTimeFormatter.format(deltaMinutes, 'minute');
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return relativeTimeFormatter.format(deltaHours, 'hour');
  }

  const deltaDays = Math.round(deltaHours / 24);
  return relativeTimeFormatter.format(deltaDays, 'day');
};
