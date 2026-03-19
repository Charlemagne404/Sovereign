import type { ProcessInfo } from '@shared/models';

import {
  formatBytes,
  formatPercentage,
  formatRelativeTime
} from '../utils/formatters';

interface ProcessDetailPanelProps {
  process: ProcessInfo | null;
  actionsDisabled: boolean;
  onOpenLocation: (process: ProcessInfo) => void;
  onKillProcess: (process: ProcessInfo) => void;
}

export const ProcessDetailPanel = ({
  process,
  actionsDisabled,
  onOpenLocation,
  onKillProcess
}: ProcessDetailPanelProps) => (
  <section className="panel detail-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Process detail</p>
        <h2>{process ? process.name : 'Select a process'}</h2>
      </div>
      {process ? <p className="panel-meta">PID {process.pid}</p> : null}
    </div>

    {process ? (
      <div className="detail-content">
        <div className="detail-callout">
          <p className="detail-label">Operating note</p>
          <p>
            This panel summarizes the currently selected process. It is not a trust
            verdict by itself, so combine it with the watchdog timeline and the file
            location before taking action.
          </p>
        </div>

        <div className="detail-grid">
          <div>
            <p className="detail-label">CPU</p>
            <p>{formatPercentage(process.cpuPercent)}</p>
          </div>
          <div>
            <p className="detail-label">Resident memory</p>
            <p>
              {formatBytes(process.memoryBytes)} ·{' '}
              {formatPercentage(process.memoryPercent)}
            </p>
          </div>
          <div>
            <p className="detail-label">Started</p>
            <p>{formatRelativeTime(process.startedAt)}</p>
          </div>
          <div>
            <p className="detail-label">User</p>
            <p>{process.user || 'User unavailable'}</p>
          </div>
        </div>

        <div className="detail-section">
          <p className="detail-label">File location</p>
          <p>{process.path || 'Path unavailable from the current telemetry source.'}</p>
        </div>

        <div className="detail-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => onOpenLocation(process)}
            disabled={actionsDisabled || !process.path}
          >
            Open file location
          </button>
          <button
            type="button"
            className="table-action-button danger"
            onClick={() => onKillProcess(process)}
            disabled={actionsDisabled}
          >
            End process
          </button>
        </div>
      </div>
    ) : (
      <div className="detail-empty">
        Choose a process from the table to inspect its current resource footprint,
        execution context, and available user-invoked actions.
      </div>
    )}
  </section>
);
