import { startTransition, useEffect, useState } from 'react';

import type {
  AppSettings,
  WatchdogCategory,
  WatchdogEvent,
  WatchdogSeverity,
  WatchdogSourceId,
  WatchdogSuppressionRule
} from '@shared/models';
import { DEFAULT_APP_SETTINGS } from '@shared/models';

import { findMatchingSuppression } from '../utils/watchdog';

const getErrorMessage = (cause: unknown, fallbackMessage: string): string =>
  cause instanceof Error ? cause.message : fallbackMessage;

interface UseWatchdogTimelineArgs {
  settings: AppSettings | null;
  onError: (message: string) => void;
  onClearError: () => void;
}

export const useWatchdogTimeline = ({
  settings,
  onError,
  onClearError
}: UseWatchdogTimelineArgs) => {
  const [events, setEvents] = useState<WatchdogEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<'all' | WatchdogSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WatchdogCategory>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | WatchdogSourceId>('all');
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const loadEvents = async (): Promise<void> => {
    setIsLoading(true);

    try {
      const nextEvents = await window.sovereign.listRecentEvents({
        limit: settings?.timelineEventLimit ?? DEFAULT_APP_SETTINGS.timelineEventLimit,
        severities: severityFilter === 'all' ? undefined : [severityFilter],
        categories: categoryFilter === 'all' ? undefined : [categoryFilter],
        sources: sourceFilter === 'all' ? undefined : [sourceFilter],
        searchText: eventSearch.trim() || undefined
      });

      startTransition(() => {
        onClearError();
        setEvents(nextEvents);
        setSelectedEventId((currentSelection) =>
          nextEvents.some((event) => event.id === currentSelection)
            ? currentSelection
            : nextEvents[0]?.id || null
        );
      });
    } catch (cause) {
      onError(getErrorMessage(cause, 'Unable to refresh the watchdog timeline.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const refreshEvents = async (): Promise<void> => {
      if (!isMounted) {
        return;
      }

      await loadEvents();
    };

    void refreshEvents();

    const unsubscribe = window.sovereign.onEventsUpdated(() => {
      void refreshEvents();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [severityFilter, categoryFilter, sourceFilter, eventSearch, settings?.timelineEventLimit]);

  const suppressions: WatchdogSuppressionRule[] = settings?.watchdog.suppressions || [];
  const visibleEvents = settings?.watchdog.showSuppressedEvents
    ? events
    : events.filter((event) => !findMatchingSuppression(event, suppressions));
  const hiddenSuppressedCount = events.length - visibleEvents.length;
  const selectedEvent =
    visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0] ?? null;
  const selectedEventSuppression = selectedEvent
    ? findMatchingSuppression(selectedEvent, suppressions)
    : null;

  return {
    events,
    visibleEvents,
    hiddenSuppressedCount,
    selectedEvent,
    selectedEventSuppression,
    isLoading,
    severityFilter,
    setSeverityFilter,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    eventSearch,
    setEventSearch,
    selectedEventId,
    setSelectedEventId,
    loadEvents
  };
};
