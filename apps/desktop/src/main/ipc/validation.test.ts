import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateEventsListRequest,
  validateOpenProcessLocationRequest,
  validateUpdateSettingsRequest
} from './validation';

test('normalizes settings payloads at the IPC boundary', () => {
  const settings = validateUpdateSettingsRequest({
    metricsRefreshIntervalMs: 200,
    timelineEventLimit: 500,
    theme: 'dark',
    enableTelemetrySummaries: true,
    thresholds: {
      cpu: { elevated: 10, stressed: 5 },
      memory: { elevated: 50, stressed: 60 },
      disk: { elevated: 70, stressed: 80 },
      network: {
        elevatedBytesPerSec: 1000,
        stressedBytesPerSec: 500
      }
    },
    monitors: {
      processLaunchMonitoring: true,
      startupMonitoring: false,
      scheduledTaskMonitoring: true,
      securityStatusMonitoring: true
    },
    watchdog: {
      showSuppressedEvents: true,
      suppressions: [{ id: ' one ', kind: 'path', value: '  C:\\Temp\\tool.exe  ', label: ' Tool ' }]
    }
  });

  assert.equal(settings.metricsRefreshIntervalMs, 1_000);
  assert.equal(settings.timelineEventLimit, 50);
  assert.equal(settings.thresholds.cpu.elevated, 10);
  assert.equal(settings.thresholds.cpu.stressed, 11);
  assert.equal(settings.thresholds.network.elevatedBytesPerSec, 64 * 1024);
  assert.equal(settings.thresholds.network.stressedBytesPerSec, 64 * 1024 + 1);
  assert.equal(settings.watchdog.suppressions[0]?.id, 'one');
  assert.equal(settings.watchdog.suppressions[0]?.value, 'C:\\Temp\\tool.exe');
});

test('rejects unsupported event query filters', () => {
  assert.throws(
    () =>
      validateEventsListRequest({
        sources: ['not-a-real-source']
      }),
    /Invalid event sources/
  );
});

test('validates and trims open-location requests', () => {
  const request = validateOpenProcessLocationRequest({
    name: '  Windows Explorer  ',
    path: '  C:\\Windows\\explorer.exe  ',
    pid: 4212
  });

  assert.deepEqual(request, {
    name: 'Windows Explorer',
    path: 'C:\\Windows\\explorer.exe',
    pid: 4212
  });
});
