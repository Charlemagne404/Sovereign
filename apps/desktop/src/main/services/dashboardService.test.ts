import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_APP_SETTINGS, type AppSettings, type SystemMetricsSnapshot } from '@shared/models';
import type { SystemProbe } from '@main/platform/systemProbe';
import type { SettingsStore } from '@main/store/settingsStore';

import { DashboardService } from './dashboardService';

const createSnapshot = (timestamp: string, cpuUsagePercent: number): SystemMetricsSnapshot => ({
  collectedAt: timestamp,
  platform: 'windows',
  identity: {
    deviceName: 'SO-01',
    osName: 'Windows 11',
    osVersion: '24H2',
    kernelVersion: '10.0.26100',
    architecture: 'x64',
    cpuModel: 'Test CPU',
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    bootedAt: '2026-04-26T06:00:00.000Z'
  },
  cpu: {
    usagePercent: cpuUsagePercent,
    coreCount: 8,
    loadAverage: [0, 0, 0],
    userPercent: cpuUsagePercent / 2,
    systemPercent: cpuUsagePercent / 2,
    speedGHz: 3.2,
    temperatureC: 55,
    perCoreUsagePercent: [cpuUsagePercent],
    status: 'healthy',
    advice: {
      headline: 'Nominal CPU load',
      details: 'No action needed.',
      action: 'Keep monitoring.'
    }
  },
  memory: {
    usagePercent: 42,
    usedBytes: 7 * 1024 * 1024 * 1024,
    totalBytes: 16 * 1024 * 1024 * 1024,
    freeBytes: 4 * 1024 * 1024 * 1024,
    availableBytes: 9 * 1024 * 1024 * 1024,
    cachedBytes: 2 * 1024 * 1024 * 1024,
    swapUsedBytes: 0,
    swapTotalBytes: 0,
    status: 'healthy',
    advice: {
      headline: 'Memory headroom available',
      details: 'No action needed.',
      action: 'Keep monitoring.'
    }
  },
  disk: {
    usagePercent: 55,
    usedBytes: 200 * 1024 * 1024 * 1024,
    totalBytes: 500 * 1024 * 1024 * 1024,
    volumes: [],
    io: {
      readBytesPerSec: 1024,
      writeBytesPerSec: 2048,
      totalBytesPerSec: 3072
    },
    status: 'healthy',
    advice: {
      headline: 'Storage is stable',
      details: 'No action needed.',
      action: 'Keep monitoring.'
    }
  },
  network: {
    receiveBytesPerSec: 1024,
    transmitBytesPerSec: 512,
    totalBytesPerSec: 1536,
    activeInterfaces: 1,
    interfaces: [],
    status: 'healthy',
    advice: {
      headline: 'Network is quiet',
      details: 'No action needed.',
      action: 'Keep monitoring.'
    }
  },
  runtime: {
    uptimeSeconds: 3600,
    activeUserSessions: 1,
    processTotals: {
      total: 120,
      running: 8,
      blocked: 0,
      sleeping: 112,
      unknown: 0
    }
  },
  topProcesses: [],
  health: {
    status: 'healthy',
    headline: 'All clear',
    summary: 'The system is healthy.',
    actions: ['Keep monitoring.']
  },
  history: []
});

const createSettingsStore = (): SettingsStore => {
  let currentSettings: AppSettings = DEFAULT_APP_SETTINGS;

  return {
    async initialize(): Promise<void> {},
    getSettings(): AppSettings {
      return currentSettings;
    },
    async updateSettings(nextSettings: AppSettings): Promise<AppSettings> {
      currentSettings = nextSettings;
      return currentSettings;
    }
  };
};

test('coalesces concurrent refreshes into one probe call and one listener update', async () => {
  const timestamps = [
    '2026-04-26T10:00:00.000Z',
    '2026-04-26T10:00:05.000Z'
  ];
  let collectCalls = 0;
  let releaseFirstProbe = (): void => {
    throw new Error('The probe gate was not initialized.');
  };

  const probe: SystemProbe = {
    async collectSnapshot(): Promise<SystemMetricsSnapshot> {
      collectCalls += 1;

      if (collectCalls === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstProbe = () => resolve();
        });
      }

      return createSnapshot(timestamps[collectCalls - 1], 20 + collectCalls);
    }
  };

  const service = new DashboardService(probe, createSettingsStore(), 5_000);
  const notifications: string[] = [];

  service.subscribe((snapshot) => {
    notifications.push(snapshot.collectedAt);
  });

  const firstRefresh = service.refreshNow();
  const secondRefresh = service.refreshNow();

  assert.equal(collectCalls, 1);
  releaseFirstProbe();

  await Promise.all([firstRefresh, secondRefresh]);

  assert.equal(collectCalls, 1);
  assert.deepEqual(notifications, ['2026-04-26T10:00:00.000Z']);
  assert.equal((await service.getSnapshot()).history.length, 1);

  await service.refreshNow();

  assert.equal(collectCalls, 2);
  assert.deepEqual(notifications, [
    '2026-04-26T10:00:00.000Z',
    '2026-04-26T10:00:05.000Z'
  ]);
  assert.equal((await service.getSnapshot()).history.length, 2);
});
