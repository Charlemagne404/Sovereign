import type { SystemMetricsSnapshot, WatchdogEvent } from '@shared/models';

import {
  formatBytes,
  formatClock,
  formatCount,
  formatDuration,
  formatGigahertz,
  formatPercentage,
  formatRate,
  formatTemperature
} from '../utils/formatters';

interface SystemStatisticsPanelProps {
  snapshot: SystemMetricsSnapshot | null;
  events: WatchdogEvent[];
}

interface StatisticTile {
  label: string;
  value: string;
  detail: string;
}

export const SystemStatisticsPanel = ({
  snapshot,
  events
}: SystemStatisticsPanelProps) => {
  if (!snapshot) {
    return (
      <section className="panel statistics-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">System statistics</p>
            <h2>Live counters</h2>
          </div>
          <p className="panel-meta">Waiting for the runtime census.</p>
        </div>
        <p className="state-block">Telemetry is still warming up.</p>
      </section>
    );
  }

  const suspiciousEventCount = events.filter((event) => event.severity === 'suspicious').length;
  const unusualEventCount = events.filter((event) => event.severity === 'unusual').length;
  const coreLoads = snapshot.cpu.perCoreUsagePercent;
  const busiestCore = coreLoads.reduce(
    (best, usagePercent, index) =>
      usagePercent > best.usagePercent ? { index, usagePercent } : best,
    { index: 0, usagePercent: 0 }
  );
  const leadProcess = snapshot.topProcesses[0] ?? null;
  const cpuThermalOrSpeed =
    snapshot.cpu.temperatureC && snapshot.cpu.temperatureC > 0
      ? formatTemperature(snapshot.cpu.temperatureC)
      : formatGigahertz(snapshot.cpu.speedGHz);

  const tiles: StatisticTile[] = [
    {
      label: 'Uptime',
      value: formatDuration(snapshot.runtime.uptimeSeconds),
      detail: `Refreshed ${formatClock(snapshot.collectedAt)}`
    },
    {
      label: 'Active sessions',
      value: formatCount(snapshot.runtime.activeUserSessions),
      detail: 'Interactive user sessions visible to the probe'
    },
    {
      label: 'Process census',
      value: formatCount(snapshot.runtime.processTotals.total),
      detail: `${formatCount(snapshot.topProcesses.length)} surfaced in the live table`
    },
    {
      label: 'Running now',
      value: formatCount(snapshot.runtime.processTotals.running),
      detail: `${formatCount(snapshot.runtime.processTotals.sleeping)} sleeping · ${formatCount(
        snapshot.runtime.processTotals.blocked
      )} blocked`
    },
    {
      label: 'Busiest core',
      value: `Core ${busiestCore.index + 1}`,
      detail: `${formatPercentage(busiestCore.usagePercent)} current load`
    },
    {
      label: 'Memory available',
      value: formatBytes(snapshot.memory.availableBytes),
      detail:
        snapshot.memory.swapTotalBytes > 0
          ? `${formatBytes(snapshot.memory.swapUsedBytes)} swap in use`
          : 'No swap telemetry reported'
    },
    {
      label: 'Disk I/O now',
      value: formatRate(snapshot.disk.io.totalBytesPerSec),
      detail: `${formatRate(snapshot.disk.io.readBytesPerSec)} read · ${formatRate(
        snapshot.disk.io.writeBytesPerSec
      )} write`
    },
    {
      label: 'Timeline pressure',
      value: `${formatCount(suspiciousEventCount)} suspicious`,
      detail: `${formatCount(unusualEventCount)} unusual in the current event view`
    },
    {
      label: snapshot.cpu.temperatureC ? 'CPU package temp' : 'CPU average speed',
      value: cpuThermalOrSpeed,
      detail: `${formatCount(snapshot.cpu.coreCount)} logical cores sampled`
    },
    {
      label: 'Lead process',
      value: leadProcess?.name || 'Unavailable',
      detail: leadProcess
        ? `${formatPercentage(leadProcess.cpuPercent)} CPU · ${formatBytes(
            leadProcess.memoryBytes
          )} resident`
        : 'Process inventory is still loading'
    }
  ];

  return (
    <section className="panel statistics-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">System statistics</p>
          <h2>Live counters</h2>
        </div>
        <p className="panel-meta">
          Dense runtime numbers for the current snapshot, without leaving the overview.
        </p>
      </div>

      <div className="statistics-grid">
        {tiles.map((tile) => (
          <article
            key={tile.label}
            className="stat-tile"
          >
            <p className="detail-label">{tile.label}</p>
            <h3>{tile.value}</h3>
            <p>{tile.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
