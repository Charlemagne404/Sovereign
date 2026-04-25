import type { TempCleanupPreview } from '@shared/models';

import {
  formatBytes,
  formatRelativeTime
} from '../utils/formatters';

interface TempCleanupPanelProps {
  preview: TempCleanupPreview | null;
  actionsDisabled: boolean;
  isPreviewLoading: boolean;
  onPreview: () => void;
  onExecute: () => void;
}

export const TempCleanupPanel = ({
  preview,
  actionsDisabled,
  isPreviewLoading,
  onPreview,
  onExecute
}: TempCleanupPanelProps) => (
  <section className="panel fixer-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Repair tool</p>
        <h2>Temp cleanup</h2>
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={onPreview}
        disabled={actionsDisabled}
      >
        {isPreviewLoading ? 'Refreshing preview…' : 'Preview cleanup'}
      </button>
    </div>

    {preview ? (
      <div className="fixer-content">
        <p className="panel-meta-inline">
          {preview.itemCount} eligible item{preview.itemCount === 1 ? '' : 's'} ·{' '}
          {formatBytes(preview.totalBytes)} reclaimable
        </p>
        <div className="cleanup-summary-grid">
          <div className="detail-callout">
            <p className="detail-label">Breakdown</p>
            <p>
              {preview.directoryCount} folder{preview.directoryCount === 1 ? '' : 's'} ·{' '}
              {preview.fileCount} file{preview.fileCount === 1 ? '' : 's'}
            </p>
            {preview.oldestModifiedAt ? (
              <p className="inventory-copy">
                Oldest candidate {formatRelativeTime(preview.oldestModifiedAt)}
              </p>
            ) : null}
          </div>
          <div className="detail-callout">
            <p className="detail-label">Skipped items</p>
            <p>
              {preview.skippedRecentCount} recent · {preview.skippedErrorCount} unreadable
            </p>
            <p className="inventory-copy">
              {preview.skippedSymlinkCount} symbolic link
              {preview.skippedSymlinkCount === 1 ? '' : 's'} skipped
            </p>
          </div>
          <div className="detail-callout">
            <p className="detail-label">Largest candidate</p>
            <p>{preview.largestEntry ? preview.largestEntry.name : 'No eligible items'}</p>
            {preview.largestEntry ? (
              <p className="inventory-copy">{formatBytes(preview.largestEntry.sizeBytes)}</p>
            ) : null}
          </div>
        </div>
        {preview.rootSummaries.length > 0 ? (
          <div className="detail-section">
            <p className="detail-label">Roots</p>
            <div className="inventory-list">
              {preview.rootSummaries.map((summary) => (
                <div key={summary.root} className="inventory-row">
                  <div>
                    <p className="inventory-title">{summary.root}</p>
                    <p className="inventory-copy">
                      {summary.itemCount} item{summary.itemCount === 1 ? '' : 's'} ·{' '}
                      {summary.directoryCount} folder{summary.directoryCount === 1 ? '' : 's'} ·{' '}
                      {summary.fileCount} file{summary.fileCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="inventory-meta">{formatBytes(summary.totalBytes)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="cleanup-list">
          {preview.entries.slice(0, 6).map((entry) => (
            <div
              key={entry.id}
              className="inventory-row"
            >
              <div>
                <p className="inventory-title">{entry.name}</p>
                <p className="inventory-copy">
                  {entry.isDirectory ? 'Folder' : 'File'} ·{' '}
                  {formatRelativeTime(entry.modifiedAt)}
                </p>
                <p className="inventory-copy">{entry.root}</p>
              </div>
              <span className="inventory-meta">{formatBytes(entry.sizeBytes)}</span>
            </div>
          ))}
        </div>
        <ul className="detail-list">
          {preview.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <button
          type="button"
          className="primary-button"
          onClick={onExecute}
          disabled={actionsDisabled || preview.itemCount === 0}
        >
          Clean previewed items
        </button>
      </div>
    ) : isPreviewLoading ? (
      <div className="fixer-empty">
        Building a safe preview from the current temp roots.
      </div>
    ) : (
      <div className="fixer-empty">
        Generate a preview first. Sovereign only cleans temp items that you have explicitly reviewed.
      </div>
    )}
  </section>
);
