import type { WatchdogEvent } from '@shared/models';

import { formatClock, formatRelativeTime } from '../utils/formatters';
import {
  WATCHDOG_CATEGORY_LABELS,
  WATCHDOG_SOURCE_LABELS
} from '../utils/watchdog';

interface EventDetailPanelProps {
  event: WatchdogEvent | null;
}

export const EventDetailPanel = ({ event }: EventDetailPanelProps) => (
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

        <div className="detail-grid">
          <div>
            <p className="detail-label">Severity</p>
            <p className={`severity-copy severity-${event.severity}`}>{event.severity}</p>
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
        </div>

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
      </div>
    ) : (
      <div className="detail-empty">
        Pick an event from the timeline to review its evidence, severity rationale,
        and the next step Sovereign recommends.
      </div>
    )}
  </section>
);
