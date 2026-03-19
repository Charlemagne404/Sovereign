import type { KeyboardEvent } from 'react';

import type { ProcessInfo } from '@shared/models';

import {
  formatBytes,
  formatPercentage,
  formatRelativeTime
} from '../utils/formatters';

interface ProcessesTableProps {
  processes: ProcessInfo[];
  selectedProcessPid: number | null;
  isLoading: boolean;
  actionsDisabled: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelectProcess: (process: ProcessInfo) => void;
  onOpenLocation: (process: ProcessInfo) => void;
  onKillProcess: (process: ProcessInfo) => void;
}

export const ProcessesTable = ({
  processes,
  selectedProcessPid,
  isLoading,
  actionsDisabled,
  searchValue,
  onSearchChange,
  onSelectProcess,
  onOpenLocation,
  onKillProcess
}: ProcessesTableProps) => {
  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    process: ProcessInfo
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    onSelectProcess(process);
  };

  return (
  <section className="panel table-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Top processes</p>
        <h2>Process triage</h2>
      </div>
      <p className="panel-meta">
        Filter first, then inspect a row before opening its path or terminating it.
      </p>
    </div>

    <input
      type="search"
      className="form-input"
      value={searchValue}
      placeholder="Filter processes by name, path, user, or PID"
      onChange={(event) => onSearchChange(event.target.value)}
    />

    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Process</th>
            <th>PID</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Started</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && processes.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="empty-cell"
              >
                Reading the live process inventory.
              </td>
            </tr>
          ) : processes.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="empty-cell"
              >
                No process data is available from the current telemetry probe.
              </td>
            </tr>
          ) : (
            processes.map((process) => (
              <tr
                key={`${process.pid}-${process.name}`}
                className={selectedProcessPid === process.pid ? 'selected-row' : ''}
                onClick={() => onSelectProcess(process)}
                onKeyDown={(event) => handleRowKeyDown(event, process)}
                tabIndex={0}
              >
                <td>
                  <div className="process-name">
                    <span>{process.name}</span>
                    <span className="process-path">{process.path || 'Path unavailable'}</span>
                  </div>
                </td>
                <td className="numeric-cell">{process.pid}</td>
                <td className="numeric-cell">{formatPercentage(process.cpuPercent)}</td>
                <td className="numeric-cell">
                  {formatBytes(process.memoryBytes)} · {formatPercentage(process.memoryPercent)}
                </td>
                <td className="numeric-cell">{formatRelativeTime(process.startedAt)}</td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="table-action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenLocation(process);
                      }}
                      disabled={actionsDisabled || !process.path}
                    >
                      Open location
                    </button>
                    <button
                      type="button"
                      className="table-action-button danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onKillProcess(process);
                      }}
                      disabled={actionsDisabled}
                    >
                      End process
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
  );
};
