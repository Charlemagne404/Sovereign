import type {
  DisableStartupItemRequest,
  EventsListRequest,
  ExecuteTempCleanupRequest,
  KillProcessRequest,
  ListActionHistoryRequest,
  OpenProcessLocationRequest,
  RestartServiceRequest,
  RestoreStartupItemRequest,
  RunUtilityActionRequest,
  StartServiceRequest,
  StopServiceRequest,
  UpdateSettingsRequest
} from '@shared/ipc';
import type {
  WatchdogCategory,
  WatchdogSeverity,
  WatchdogSourceId
} from '@shared/models';
import { normalizeSettings } from '@shared/settings';

const WATCHDOG_SEVERITIES: readonly WatchdogSeverity[] = [
  'info',
  'unusual',
  'suspicious'
];
const WATCHDOG_CATEGORIES: readonly WatchdogCategory[] = [
  'application',
  'system',
  'process',
  'network',
  'storage',
  'security'
];
const WATCHDOG_SOURCES: readonly WatchdogSourceId[] = [
  'watchdog',
  'process-launch',
  'startup-items',
  'scheduled-tasks',
  'defender-status',
  'firewall-status',
  'gatekeeper-status',
  'application-firewall-status'
];
const UTILITY_ACTIONS: readonly RunUtilityActionRequest['action'][] = [
  'flush-dns',
  'restart-explorer',
  'empty-recycle-bin',
  'restart-finder',
  'empty-trash'
];

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

const readRequiredString = (candidate: unknown, fieldName: string): string => {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return candidate.trim();
};

const readOptionalString = (candidate: unknown): string | undefined => {
  if (candidate == null) {
    return undefined;
  }

  if (typeof candidate !== 'string') {
    throw new Error('Invalid string value.');
  }

  const trimmedValue = candidate.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const readRequiredPositiveInteger = (candidate: unknown, fieldName: string): number => {
  if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate <= 0) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return candidate;
};

const readOptionalPositiveInteger = (
  candidate: unknown,
  fieldName: string
): number | undefined => {
  if (candidate == null) {
    return undefined;
  }

  return readRequiredPositiveInteger(candidate, fieldName);
};

const readAllowedArray = <Value extends string>(
  candidate: unknown,
  fieldName: string,
  allowedValues: readonly Value[]
): Value[] | undefined => {
  if (candidate == null) {
    return undefined;
  }

  if (!Array.isArray(candidate)) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return candidate.map((entry) => {
    if (typeof entry !== 'string' || !allowedValues.includes(entry as Value)) {
      throw new Error(`Invalid ${fieldName}.`);
    }

    return entry as Value;
  });
};

const readOptionalStringArray = (
  candidate: unknown,
  fieldName: string
): string[] | undefined => {
  if (candidate == null) {
    return undefined;
  }

  if (!Array.isArray(candidate)) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return candidate.map((entry) => readRequiredString(entry, fieldName));
};

export const validateEventsListRequest = (request: unknown): EventsListRequest | undefined => {
  if (request == null) {
    return undefined;
  }

  if (!isRecord(request)) {
    throw new Error('Invalid event query.');
  }

  return {
    limit: readOptionalPositiveInteger(request.limit, 'event query limit'),
    severities: readAllowedArray(request.severities, 'event severities', WATCHDOG_SEVERITIES),
    categories: readAllowedArray(request.categories, 'event categories', WATCHDOG_CATEGORIES),
    sources: readAllowedArray(request.sources, 'event sources', WATCHDOG_SOURCES),
    searchText: readOptionalString(request.searchText)
  };
};

export const validateUpdateSettingsRequest = (request: unknown): UpdateSettingsRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid settings payload.');
  }

  return normalizeSettings(request);
};

export const validateExecuteTempCleanupRequest = (
  request: unknown
): ExecuteTempCleanupRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid temp cleanup request.');
  }

  return {
    previewId: readRequiredString(request.previewId, 'temp cleanup preview ID'),
    entryIds: readOptionalStringArray(request.entryIds, 'temp cleanup entry IDs')
  };
};

export const validateKillProcessRequest = (request: unknown): KillProcessRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid process action request.');
  }

  return {
    pid: readRequiredPositiveInteger(request.pid, 'process ID'),
    name: readRequiredString(request.name, 'process name')
  };
};

export const validateOpenProcessLocationRequest = (
  request: unknown
): OpenProcessLocationRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid process location request.');
  }

  return {
    name: readRequiredString(request.name, 'process name'),
    path: readRequiredString(request.path, 'process path'),
    pid: readOptionalPositiveInteger(request.pid, 'process ID') ?? null
  };
};

export const validateDisableStartupItemRequest = (
  request: unknown
): DisableStartupItemRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid startup item request.');
  }

  return {
    startupItemId: readRequiredString(request.startupItemId, 'startup item ID')
  };
};

export const validateRestoreStartupItemRequest = (
  request: unknown
): RestoreStartupItemRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid startup restore request.');
  }

  return {
    backupId: readRequiredString(request.backupId, 'startup backup ID')
  };
};

const validateServiceRequest = <Value extends StartServiceRequest | StopServiceRequest | RestartServiceRequest>(
  request: unknown
): Value => {
  if (!isRecord(request)) {
    throw new Error('Invalid service action request.');
  }

  return {
    serviceName: readRequiredString(request.serviceName, 'service name'),
    displayName: readRequiredString(request.displayName, 'service display name')
  } as Value;
};

export const validateStartServiceRequest = (request: unknown): StartServiceRequest =>
  validateServiceRequest<StartServiceRequest>(request);

export const validateStopServiceRequest = (request: unknown): StopServiceRequest =>
  validateServiceRequest<StopServiceRequest>(request);

export const validateRestartServiceRequest = (
  request: unknown
): RestartServiceRequest => validateServiceRequest<RestartServiceRequest>(request);

export const validateListActionHistoryRequest = (
  request: unknown
): ListActionHistoryRequest | undefined => {
  if (request == null) {
    return undefined;
  }

  if (!isRecord(request)) {
    throw new Error('Invalid action history request.');
  }

  return {
    limit: readOptionalPositiveInteger(request.limit, 'action history limit')
  };
};

export const validateRunUtilityActionRequest = (
  request: unknown
): RunUtilityActionRequest => {
  if (!isRecord(request)) {
    throw new Error('Invalid utility action request.');
  }

  const action = readRequiredString(request.action, 'utility action');
  if (!UTILITY_ACTIONS.includes(action as RunUtilityActionRequest['action'])) {
    throw new Error('Invalid utility action.');
  }

  return {
    action: action as RunUtilityActionRequest['action']
  };
};
