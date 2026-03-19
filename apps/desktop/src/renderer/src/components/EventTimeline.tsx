import type { WatchdogEvent } from '@shared/models';

import { formatClock, formatRelativeTime } from '../utils/formatters';
import {
  WATCHDOG_CATEGORY_LABELS,
  WATCHDOG_SOURCE_LABELS
} from '../utils/watchdog';

interface EventTimelineProps {
  events: WatchdogEvent[];
  selectedEventId: string | null;
  isLoading: boolean;
  emptyMessage?: string;
  onSelectEvent: (id: string) => void;
}

export const EventTimeline = ({
  events,
  selectedEventId,
  isLoading,
  emptyMessage = 'No events match the current filters.',
  onSelectEvent
}: EventTimelineProps) => (
  <div className="timeline">
    {isLoading && events.length === 0 ? (
      <div className="timeline-empty">Reading recent watchdog history.</div>
    ) : events.length === 0 ? (
      <div className="timeline-empty">{emptyMessage}</div>
    ) : (
      events.map((event) => (
        <button
          key={event.id}
          type="button"
          className={`timeline-item ${selectedEventId === event.id ? 'selected' : ''}`}
          onClick={() => onSelectEvent(event.id)}
        >
          <div className="timeline-header">
            <span className={`severity-pill severity-${event.severity}`}>{event.severity}</span>
            <div className="timeline-time">
              <span>{formatRelativeTime(event.timestamp)}</span>
              <span>{formatClock(event.timestamp)}</span>
            </div>
          </div>

          <div className="timeline-meta-line">
            <span className="timeline-source">{WATCHDOG_SOURCE_LABELS[event.source]}</span>
            <span className="timeline-category">
              {WATCHDOG_CATEGORY_LABELS[event.category]}
            </span>
          </div>

          <h3>{event.title}</h3>
          <p>{event.description}</p>
          <p className="timeline-action">{event.recommendedAction}</p>
        </button>
      ))
    )}
  </div>
);
