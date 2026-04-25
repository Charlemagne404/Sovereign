import type { ProcessInfo, StartupItem, WatchdogEvent } from '@shared/models';

const normalizePath = (candidate: string | null | undefined): string =>
  (candidate || '').replace(/\\/g, '/').toLowerCase().trim();

export const extractProcessIdFromEvent = (event: WatchdogEvent): number | null => {
  const pidEvidence = event.evidence.find((item) => /^pid:\s*\d+/i.test(item));
  const parsedPid = pidEvidence?.match(/(\d+)/)?.[1];

  return parsedPid ? Number(parsedPid) : null;
};

export const findMatchingProcessForEvent = (
  event: WatchdogEvent,
  processes: ProcessInfo[]
): ProcessInfo | null => {
  const eventPid = extractProcessIdFromEvent(event);
  const normalizedSubjectPath = normalizePath(event.subjectPath);
  const normalizedSubjectName = event.subjectName?.trim().toLowerCase() || '';

  return (
    processes.find((process) => eventPid != null && process.pid === eventPid) ||
    processes.find(
      (process) =>
        normalizedSubjectPath.length > 0 && normalizePath(process.path) === normalizedSubjectPath
    ) ||
    processes.find(
      (process) =>
        normalizedSubjectName.length > 0 && process.name.trim().toLowerCase() === normalizedSubjectName
    ) ||
    null
  );
};

export const findMatchingStartupItemForEvent = (
  event: WatchdogEvent,
  startupItems: StartupItem[]
): StartupItem | null => {
  if (event.source !== 'startup-items') {
    return null;
  }

  const normalizedSubjectPath = normalizePath(event.subjectPath);
  const normalizedSubjectName = event.subjectName?.trim().toLowerCase() || '';

  return (
    startupItems.find(
      (item) =>
        normalizedSubjectPath.length > 0 && normalizePath(item.command) === normalizedSubjectPath
    ) ||
    startupItems.find(
      (item) =>
        normalizedSubjectName.length > 0 && item.name.trim().toLowerCase() === normalizedSubjectName
    ) ||
    null
  );
};
