import type { WatchdogEvent } from '@shared/models';

import { formatClock, formatRelativeTime } from '../utils/formatters';
import {
  WATCHDOG_CATEGORY_LABELS,
  WATCHDOG_CONFIDENCE_LABELS,
  WATCHDOG_KIND_LABELS,
  WATCHDOG_SOURCE_LABELS
} from '../utils/watchdog';

export interface EventDetailAction {
  id: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}

interface EventDetailPanelProps {
  event: WatchdogEvent | null;
  actions?: EventDetailAction[];
  suppressionLabel?: string | null;
  actionsDisabled?: boolean;
  onSuppress?: () => void;
  onRemoveSuppression?: () => void;
}

export const EventDetailPanel = ({
  event,
  actions = [],
  suppressionLabel = null,
  actionsDisabled = false,
  onSuppress,
  onRemoveSuppression
}: EventDetailPanelProps) => (
  <section className="panel detail-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Event detail</p>
        <h2>{event ? event.title : 'Select an event'}</h2>
      </div>
      {event ? (
        <span className={`severity-pill severity-${event.severity}`}>{event.severity}</span>
      ) : null}
    </div>

    {event ? (
      <div className="detail-content">
        <div className="detail-callout">
          <p className="detail-label">Assessment</p>
          <p>{event.description}</p>
        </div>

        <div className="detail-callout">
          <p className="detail-label">Why this matters</p>
          <p>{event.whyThisMatters}</p>
        </div>

        <div className="detail-grid">
          <div>
            <p className="detail-label">Severity</p>
            <p className={`severity-copy severity-${event.severity}`}>{event.severity}</p>
          </div>
          <div>
            <p className="detail-label">Kind</p>
            <p>{WATCHDOG_KIND_LABELS[event.kind]}</p>
          </div>
          <div>
            <p className="detail-label">Confidence</p>
            <p>{WATCHDOG_CONFIDENCE_LABELS[event.confidence]}</p>
          </div>
          <div>
            <p className="detail-label">Source</p>
            <p>{WATCHDOG_SOURCE_LABELS[event.source]}</p>
          </div>
          <div>
            <p className="detail-label">Category</p>
            <p>{WATCHDOG_CATEGORY_LABELS[event.category]}</p>
          </div>
          <div>
            <p className="detail-label">Observed</p>
            <p>{formatRelativeTime(event.timestamp)}</p>
          </div>
          <div>
            <p className="detail-label">Timestamp</p>
            <p>{formatClock(event.timestamp)}</p>
          </div>
          <div>
            <p className="detail-label">First seen</p>
            <p>{formatRelativeTime(event.firstSeenAt)}</p>
          </div>
          <div>
            <p className="detail-label">Last seen</p>
            <p>{formatRelativeTime(event.lastSeenAt)}</p>
          </div>
          <div>
            <p className="detail-label">Occurrences</p>
            <p>{event.occurrenceCount}</p>
          </div>
          <div>
            <p className="detail-label">Related events</p>
            <p>{event.relatedEventCount}</p>
          </div>
        </div>

        <div className="detail-section">
          <p className="detail-label">Rationale</p>
          <p>{event.rationale}</p>
        </div>

        {event.subjectName || event.subjectPath ? (
          <div className="detail-section">
            <p className="detail-label">Affected subject</p>
            <p>{event.subjectName || 'Unnamed subject'}</p>
            {event.subjectPath ? <p>{event.subjectPath}</p> : null}
          </div>
        ) : null}

        {event.pathSignals.length > 0 ? (
          <div className="detail-section">
            <p className="detail-label">Path signals</p>
            <p>{event.pathSignals.join(', ')}</p>
          </div>
        ) : null}

        {event.fileTrust ? (
          <div className="detail-section">
            <p className="detail-label">File trust</p>
            <p>
              {event.fileTrust.signatureStatus}
              {event.fileTrust.companyName ? ` · ${event.fileTrust.companyName}` : ''}
            </p>
            {event.fileTrust.publisher ? <p>{event.fileTrust.publisher}</p> : null}
            {event.fileTrust.error ? <p>{event.fileTrust.error}</p> : null}
          </div>
        ) : null}

        <div className="detail-section">
          <p className="detail-label">Supporting evidence</p>
          <ul className="detail-list">
            {event.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="detail-callout emphasis">
          <p className="detail-label">Recommended action</p>
          <p>{event.recommendedAction}</p>
        </div>

        {actions.length > 0 ? (
          <div className="detail-section">
            <p className="detail-label">Available actions</p>
            <div className="detail-actions">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={
                    action.tone === 'primary'
                      ? 'primary-button'
                      : action.tone === 'danger'
                        ? 'table-action-button danger'
                        : 'secondary-button'
                  }
                  onClick={action.onSelect}
                  disabled={actionsDisabled || action.disabled}
                  title={action.title}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {suppressionLabel ? (
          <div className="detail-callout">
            <p className="detail-label">Suppression</p>
            <p>This event is currently hidden by the suppression rule "{suppressionLabel}".</p>
            {onRemoveSuppression ? (
              <button
                type="button"
                className="secondary-button"
                onClick={onRemoveSuppression}
                disabled={actionsDisabled}
              >
                Remove suppression
              </button>
            ) : null}
          </div>
        ) : onSuppress ? (
          <div className="detail-callout">
            <p className="detail-label">Reduce future noise</p>
            <p>
              Suppress future alerts for this exact path or event fingerprint if you know
              it is expected.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={onSuppress}
              disabled={actionsDisabled}
            >
              Suppress future alerts
            </button>
          </div>
        ) : null}
      </div>
    ) : (
      <div className="detail-empty">
        Pick an event from the timeline to review its evidence, severity rationale,
        and the next step Sovereign recommends.
      </div>
    )}
  </section>
);
