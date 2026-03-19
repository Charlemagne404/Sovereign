import os from 'node:os';

import si from 'systeminformation';

import type {
  AppSettings,
  DiskVolume,
  PlatformKey,
  ProcessInfo,
  SystemMetricsSnapshot
} from '@shared/models';
import {
  buildSystemHealthSummary,
  getHealthRules,
  getNetworkStatus,
  getPercentStatus,
  getResourceAdvice
} from '@main/services/healthRules';
import type { SystemProbe } from '@main/platform/systemProbe';

interface ProbeProfile {
  platform: PlatformKey;
  volumeFilter: (volume: DiskVolume) => boolean;
}

const EMPTY_CPU_SPEED: si.Systeminformation.CpuCurrentSpeedData = {
  min: 0,
  max: 0,
  avg: 0,
  cores: []
};

const EMPTY_CPU_TEMPERATURE: si.Systeminformation.CpuTemperatureData = {
  main: 0,
  cores: [],
  max: 0
};

const EMPTY_FS_STATS: si.Systeminformation.FsStatsData = {
  rx: 0,
  wx: 0,
  tx: 0,
  rx_sec: 0,
  wx_sec: 0,
  tx_sec: 0,
  ms: 0
};

const EMPTY_NETWORK_STATS: si.Systeminformation.NetworkStatsData[] = [];

const clampPercentage = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

const clampPositiveRate = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, value || 0) : 0;

const toOptionalPositiveNumber = (value: number | null | undefined): number | null =>
  Number.isFinite(value) && Number(value) > 0 ? Number(value) : null;

const mapVolume = (volume: si.Systeminformation.FsSizeData): DiskVolume => ({
  name: volume.fs || volume.mount || 'Unknown volume',
  mount: volume.mount || volume.fs || 'Unknown mount',
  filesystem: volume.type || 'unknown',
  sizeBytes: volume.size || 0,
  usedBytes: volume.used || 0,
  usagePercent: clampPercentage(volume.use || 0)
});

const sortProcesses = (left: ProcessInfo, right: ProcessInfo): number => {
  if (right.cpuPercent !== left.cpuPercent) {
    return right.cpuPercent - left.cpuPercent;
  }

  return right.memoryBytes - left.memoryBytes;
};

const safeCollect = async <T>(collector: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await collector();
  } catch {
    return fallback;
  }
};

const collectArray = async <T>(
  collector: () => Promise<T[] | null | undefined>,
  fallback: T[] = []
): Promise<T[]> => {
  const result = await safeCollect(collector, fallback);
  return Array.isArray(result) ? result : fallback;
};

const collectObject = async <T extends object>(
  collector: () => Promise<T | null | undefined>,
  fallback: T
): Promise<T> => {
  const result = await safeCollect(collector, fallback);
  return result && typeof result === 'object' ? result : fallback;
};

export class SystemInformationProbe implements SystemProbe {
  constructor(private readonly profile: ProbeProfile) {}

  async collectSnapshot(settings: AppSettings): Promise<SystemMetricsSnapshot> {
    const [cpuLoad, memoryStats, diskStats, networkStats, networkInterfaces, processStats] =
      await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        collectArray(() => si.networkStats('*'), EMPTY_NETWORK_STATS),
        collectArray(
          () => si.networkInterfaces(),
          [] as si.Systeminformation.NetworkInterfacesData[]
        ),
        si.processes()
      ]);
    const currentTime = si.time();
    const [cpuSpeed, cpuTemperature, fsStats, userSessions] = await Promise.all([
      collectObject(() => si.cpuCurrentSpeed(), EMPTY_CPU_SPEED),
      collectObject(() => si.cpuTemperature(), EMPTY_CPU_TEMPERATURE),
      collectObject(() => si.fsStats(), EMPTY_FS_STATS),
      collectArray(() => si.users(), [] as si.Systeminformation.UserData[])
    ]);

    const cpuUsagePercent = clampPercentage(cpuLoad.currentLoad);
    const memoryUsedBytes = memoryStats.active || memoryStats.used || 0;
    const memoryTotalBytes = memoryStats.total || 0;
    const memoryUsagePercent =
      memoryTotalBytes > 0 ? clampPercentage((memoryUsedBytes / memoryTotalBytes) * 100) : 0;

    const volumes = diskStats
      .map(mapVolume)
      .filter((volume) => volume.sizeBytes > 0)
      .filter(this.profile.volumeFilter);

    const diskTotalBytes = volumes.reduce((sum, volume) => sum + volume.sizeBytes, 0);
    const diskUsedBytes = volumes.reduce((sum, volume) => sum + volume.usedBytes, 0);
    const diskUsagePercent =
      diskTotalBytes > 0 ? clampPercentage((diskUsedBytes / diskTotalBytes) * 100) : 0;

    const networkInterfaceMap = new Map(
      networkInterfaces.map((networkInterface) => [networkInterface.iface, networkInterface])
    );
    const interfaceStats = networkStats
      .filter(
        (
          stat
        ): stat is si.Systeminformation.NetworkStatsData =>
          Boolean(stat) && typeof stat.iface === 'string' && stat.iface.length > 0
      )
      .map((stat) => {
        const networkInterface = networkInterfaceMap.get(stat.iface);
        const receiveRate = clampPositiveRate(stat.rx_sec);
        const transmitRate = clampPositiveRate(stat.tx_sec);

        return {
          name: stat.iface,
          type: networkInterface?.type || 'unknown',
          isExternal: !networkInterface?.internal,
          speedMbps: toOptionalPositiveNumber(networkInterface?.speed),
          status: stat.operstate || networkInterface?.operstate || 'unknown',
          receiveBytesPerSec: receiveRate,
          transmitBytesPerSec: transmitRate,
          totalBytesPerSec: receiveRate + transmitRate
        };
      })
      .sort((left, right) => right.totalBytesPerSec - left.totalBytesPerSec);

    const receiveBytesPerSec = interfaceStats.reduce(
      (sum, stat) => sum + stat.receiveBytesPerSec,
      0
    );
    const transmitBytesPerSec = interfaceStats.reduce(
      (sum, stat) => sum + stat.transmitBytesPerSec,
      0
    );
    const totalBytesPerSec = receiveBytesPerSec + transmitBytesPerSec;
    const diskReadBytesPerSec = clampPositiveRate(fsStats.rx_sec);
    const diskWriteBytesPerSec = clampPositiveRate(fsStats.wx_sec);

    const healthRules = getHealthRules(settings);
    const cpuStatus = getPercentStatus(cpuUsagePercent, healthRules.cpu);
    const memoryStatus = getPercentStatus(memoryUsagePercent, healthRules.memory);
    const diskStatus = getPercentStatus(diskUsagePercent, healthRules.disk);
    const networkStatus = getNetworkStatus(totalBytesPerSec, healthRules.network);

    const topProcesses = processStats.list
      .map((process): ProcessInfo => ({
        pid: process.pid,
        name: process.name || process.command || 'Unknown process',
        cpuPercent: clampPercentage(process.cpu || 0),
        memoryBytes: process.memRss || 0,
        memoryPercent: clampPercentage(process.mem || 0),
        path: process.path || null,
        startedAt: process.started || null,
        user: process.user || null
      }))
      .sort(sortProcesses)
      .slice(0, 10);

    return {
      collectedAt: new Date().toISOString(),
      platform: this.profile.platform,
      cpu: {
        usagePercent: cpuUsagePercent,
        coreCount: os.cpus().length,
        loadAverage: os.loadavg(),
        userPercent: clampPercentage(cpuLoad.currentLoadUser),
        systemPercent: clampPercentage(cpuLoad.currentLoadSystem),
        speedGHz: toOptionalPositiveNumber(cpuSpeed.avg),
        temperatureC: toOptionalPositiveNumber(cpuTemperature.main),
        perCoreUsagePercent: cpuLoad.cpus.map((cpu) => clampPercentage(cpu.load)),
        status: cpuStatus,
        advice: getResourceAdvice('cpu', cpuStatus)
      },
      memory: {
        usagePercent: memoryUsagePercent,
        usedBytes: memoryUsedBytes,
        totalBytes: memoryTotalBytes,
        freeBytes: Math.max(memoryStats.free || 0, 0),
        availableBytes: Math.max(memoryStats.available || memoryStats.free || 0, 0),
        cachedBytes: Math.max(memoryStats.cached || memoryStats.buffcache || 0, 0),
        swapUsedBytes: Math.max(memoryStats.swapused || 0, 0),
        swapTotalBytes: Math.max(memoryStats.swaptotal || 0, 0),
        status: memoryStatus,
        advice: getResourceAdvice('memory', memoryStatus)
      },
      disk: {
        usagePercent: diskUsagePercent,
        usedBytes: diskUsedBytes,
        totalBytes: diskTotalBytes,
        volumes,
        io: {
          readBytesPerSec: diskReadBytesPerSec,
          writeBytesPerSec: diskWriteBytesPerSec,
          totalBytesPerSec: diskReadBytesPerSec + diskWriteBytesPerSec
        },
        status: diskStatus,
        advice: getResourceAdvice('disk', diskStatus)
      },
      network: {
        receiveBytesPerSec,
        transmitBytesPerSec,
        totalBytesPerSec,
        activeInterfaces: interfaceStats.filter(
          (networkInterface) =>
            networkInterface.status === 'up' || networkInterface.totalBytesPerSec > 0
        ).length,
        interfaces: interfaceStats,
        status: networkStatus,
        advice: getResourceAdvice('network', networkStatus)
      },
      runtime: {
        uptimeSeconds: Math.max(0, currentTime.uptime || 0),
        activeUserSessions: userSessions.length,
        processTotals: {
          total: Math.max(processStats.all || 0, 0),
          running: Math.max(processStats.running || 0, 0),
          blocked: Math.max(processStats.blocked || 0, 0),
          sleeping: Math.max(processStats.sleeping || 0, 0),
          unknown: Math.max(processStats.unknown || 0, 0)
        }
      },
      topProcesses,
      health: buildSystemHealthSummary({
        cpu: cpuStatus,
        memory: memoryStatus,
        disk: diskStatus,
        network: networkStatus
      }),
      history: []
    };
  }
}
