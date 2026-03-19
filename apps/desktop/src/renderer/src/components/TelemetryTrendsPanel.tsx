import type { MetricsHistoryPoint, SystemMetricsSnapshot } from '@shared/models';

import {
  formatBytes,
  formatPercentage,
  formatRate
} from '../utils/formatters';

interface TelemetryTrendsPanelProps {
  history: MetricsHistoryPoint[];
  snapshot: SystemMetricsSnapshot | null;
}

type TrendTone = 'cpu' | 'memory' | 'network' | 'disk';

interface TrendCardDefinition {
  title: string;
  value: string;
  detail: string;
  stats: Array<{ label: string; value: string }>;
  points: number[];
  ceiling: number;
  tone: TrendTone;
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 112;

const calculateAverage = (values: number[]): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const calculatePeak = (values: number[]): number =>
  values.length > 0 ? Math.max(...values) : 0;

const buildSeriesPoints = (values: number[], ceiling: number): string => {
  if (values.length === 0) {
    return '';
  }

  const safeCeiling = Math.max(ceiling, 1);
  const drawableHeight = CHART_HEIGHT - 8;

  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? CHART_WIDTH / 2 : (index / (values.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - (Math.min(value, safeCeiling) / safeCeiling) * drawableHeight - 4;

      return `${x},${y}`;
    })
    .join(' ');
};

const buildAreaPoints = (points: string): string =>
  points ? `0,${CHART_HEIGHT} ${points} ${CHART_WIDTH},${CHART_HEIGHT}` : '';

const TrendCard = ({
  title,
  value,
  detail,
  stats,
  points,
  ceiling,
  tone
}: TrendCardDefinition) => {
  const chartPoints = buildSeriesPoints(points, ceiling);
  const areaPoints = buildAreaPoints(chartPoints);

  return (
    <article className={`trend-card tone-${tone}`}>
      <div className="trend-card-header">
        <div>
          <p className="detail-label">{title}</p>
          <h3>{value}</h3>
        </div>
        <span className={`trend-dot tone-${tone}`} />
      </div>

      <p className="trend-detail">{detail}</p>

      <div className="trend-chart-shell">
        {chartPoints ? (
          <svg
            className="trend-chart"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1="0"
              y1={CHART_HEIGHT - 1}
              x2={CHART_WIDTH}
              y2={CHART_HEIGHT - 1}
              className="trend-baseline"
            />
            <line
              x1="0"
              y1={CHART_HEIGHT / 2}
              x2={CHART_WIDTH}
              y2={CHART_HEIGHT / 2}
              className="trend-midline"
            />
            <polygon
              points={areaPoints}
              className="trend-area"
            />
            <polyline
              points={chartPoints}
              className="trend-line"
            />
          </svg>
        ) : (
          <div className="trend-placeholder">Waiting for enough samples to draw this chart.</div>
        )}
      </div>

      <div className="trend-stat-row">
        {stats.map((stat) => (
          <div
            key={`${title}-${stat.label}`}
            className="trend-stat"
          >
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
};

export const TelemetryTrendsPanel = ({
  history,
  snapshot
}: TelemetryTrendsPanelProps) => {
  const recentHistory = history.slice(-18);
  const cpuSeries = recentHistory.map((sample) => sample.cpuUsagePercent);
  const memorySeries = recentHistory.map((sample) => sample.memoryUsagePercent);
  const networkSeries = recentHistory.map((sample) => sample.networkBytesPerSec);
  const diskSeries = recentHistory.map(
    (sample) => sample.diskReadBytesPerSec + sample.diskWriteBytesPerSec
  );

  const cards: TrendCardDefinition[] = snapshot
    ? [
        {
          title: 'CPU load',
          value: formatPercentage(snapshot.cpu.usagePercent),
          detail: `${formatPercentage(snapshot.cpu.userPercent)} user · ${formatPercentage(
            snapshot.cpu.systemPercent
          )} system`,
          stats: [
            {
              label: 'Average',
              value: formatPercentage(calculateAverage(cpuSeries))
            },
            {
              label: 'Peak',
              value: formatPercentage(calculatePeak(cpuSeries))
            }
          ],
          points: cpuSeries,
          ceiling: 100,
          tone: 'cpu'
        },
        {
          title: 'Memory pressure',
          value: formatPercentage(snapshot.memory.usagePercent),
          detail: `${formatBytes(snapshot.memory.availableBytes)} available · ${formatBytes(
            snapshot.memory.swapUsedBytes
          )} swap used`,
          stats: [
            {
              label: 'Available',
              value: formatBytes(snapshot.memory.availableBytes)
            },
            {
              label: 'Peak',
              value: formatPercentage(calculatePeak(memorySeries))
            }
          ],
          points: memorySeries,
          ceiling: 100,
          tone: 'memory'
        },
        {
          title: 'Network throughput',
          value: formatRate(snapshot.network.totalBytesPerSec),
          detail: `${formatRate(snapshot.network.receiveBytesPerSec)} down · ${formatRate(
            snapshot.network.transmitBytesPerSec
          )} up`,
          stats: [
            {
              label: 'Average',
              value: formatRate(calculateAverage(networkSeries))
            },
            {
              label: 'Peak',
              value: formatRate(calculatePeak(networkSeries))
            }
          ],
          points: networkSeries,
          ceiling: calculatePeak(networkSeries) * 1.15 || 1,
          tone: 'network'
        },
        {
          title: 'Disk activity',
          value: formatRate(snapshot.disk.io.totalBytesPerSec),
          detail: `${formatRate(snapshot.disk.io.readBytesPerSec)} read · ${formatRate(
            snapshot.disk.io.writeBytesPerSec
          )} write`,
          stats: [
            {
              label: 'Average',
              value: formatRate(calculateAverage(diskSeries))
            },
            {
              label: 'Peak',
              value: formatRate(calculatePeak(diskSeries))
            }
          ],
          points: diskSeries,
          ceiling: calculatePeak(diskSeries) * 1.15 || 1,
          tone: 'disk'
        }
      ]
    : [];

  if (!snapshot) {
    return (
      <section className="panel trend-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Trend graphs</p>
            <h2>Telemetry curves</h2>
          </div>
          <p className="panel-meta">
            Building the first chart window from live samples.
          </p>
        </div>
        <p className="state-block">Waiting for the first full dashboard snapshot.</p>
      </section>
    );
  }

  return (
    <section className="panel trend-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Trend graphs</p>
          <h2>Telemetry curves</h2>
        </div>
        <p className="panel-meta">
          {recentHistory.length} live sample{recentHistory.length === 1 ? '' : 's'} across CPU,
          memory, network, and disk activity.
        </p>
      </div>

      <div className="trend-grid">
        {cards.map((card) => (
          <TrendCard
            key={card.title}
            {...card}
          />
        ))}
      </div>
    </section>
  );
};
