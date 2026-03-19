import type { ProcessInfo, SystemMetricsSnapshot } from '@shared/models';

import {
  formatBytes,
  formatPercentage
} from '../utils/formatters';

interface WorkloadInsightsPanelProps {
  snapshot: SystemMetricsSnapshot | null;
}

interface RankedProcess extends ProcessInfo {
  widthPercent: number;
  valueLabel: string;
}

const CORE_CARD_LIMIT = 12;
const PROCESS_BAR_LIMIT = 5;

export const WorkloadInsightsPanel = ({
  snapshot
}: WorkloadInsightsPanelProps) => {
  if (!snapshot) {
    return (
      <section className="panel workload-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Workload graphs</p>
            <h2>Core and process breakdown</h2>
          </div>
          <p className="panel-meta">Waiting for process and core telemetry.</p>
        </div>
        <p className="state-block">No live workload graph is available yet.</p>
      </section>
    );
  }

  const coreLoads = snapshot.cpu.perCoreUsagePercent
    .map((usagePercent, index) => ({
      label: `Core ${index + 1}`,
      usagePercent
    }))
    .sort((left, right) => right.usagePercent - left.usagePercent)
    .slice(0, CORE_CARD_LIMIT);

  const maxProcessMemory = Math.max(
    ...snapshot.topProcesses.map((process) => process.memoryBytes),
    1
  );
  const topCpuProcesses: RankedProcess[] = [...snapshot.topProcesses]
    .sort((left, right) => right.cpuPercent - left.cpuPercent)
    .slice(0, PROCESS_BAR_LIMIT)
    .map((process) => ({
      ...process,
      widthPercent: Math.max(6, process.cpuPercent),
      valueLabel: formatPercentage(process.cpuPercent)
    }));
  const topMemoryProcesses: RankedProcess[] = [...snapshot.topProcesses]
    .sort((left, right) => right.memoryBytes - left.memoryBytes)
    .slice(0, PROCESS_BAR_LIMIT)
    .map((process) => ({
      ...process,
      widthPercent: Math.max(6, (process.memoryBytes / maxProcessMemory) * 100),
      valueLabel: formatBytes(process.memoryBytes)
    }));

  return (
    <section className="panel workload-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Workload graphs</p>
          <h2>Core and process breakdown</h2>
        </div>
        <p className="panel-meta">
          Per-core bars and ranked process loads make it easier to see where pressure is coming
          from.
        </p>
      </div>

      <div className="core-grid">
        {coreLoads.map((core) => (
          <article
            key={core.label}
            className="core-card"
          >
            <div className="core-card-header">
              <span>{core.label}</span>
              <strong>{formatPercentage(core.usagePercent)}</strong>
            </div>
            <div
              className="meter compact"
              aria-hidden="true"
            >
              <div
                className="meter-fill"
                style={{ width: `${Math.min(Math.max(core.usagePercent, 0), 100)}%` }}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="workload-rankings">
        <div className="ranking-column">
          <div className="ranking-heading">
            <p className="detail-label">Top CPU processes</p>
            <span>Current percentage of total CPU time</span>
          </div>
          {topCpuProcesses.map((process) => (
            <div
              key={`cpu-${process.pid}-${process.name}`}
              className="ranking-row"
            >
              <div className="ranking-copy">
                <strong>{process.name}</strong>
                <span>PID {process.pid}</span>
              </div>
              <div className="ranking-bar-shell">
                <div
                  className="ranking-bar tone-cpu"
                  style={{ width: `${Math.min(process.widthPercent, 100)}%` }}
                />
              </div>
              <span className="ranking-value">{process.valueLabel}</span>
            </div>
          ))}
        </div>

        <div className="ranking-column">
          <div className="ranking-heading">
            <p className="detail-label">Top resident memory</p>
            <span>Relative to the heaviest visible process</span>
          </div>
          {topMemoryProcesses.map((process) => (
            <div
              key={`memory-${process.pid}-${process.name}`}
              className="ranking-row"
            >
              <div className="ranking-copy">
                <strong>{process.name}</strong>
                <span>PID {process.pid}</span>
              </div>
              <div className="ranking-bar-shell">
                <div
                  className="ranking-bar tone-memory"
                  style={{ width: `${Math.min(process.widthPercent, 100)}%` }}
                />
              </div>
              <span className="ranking-value">{process.valueLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
