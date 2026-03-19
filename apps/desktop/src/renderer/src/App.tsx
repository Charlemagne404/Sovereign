import { startTransition, useDeferredValue, useEffect, useState } from 'react';

import type {
  AppSettings,
  FixActionResult,
  ProcessInfo,
  ServiceSummary,
  StartupItem,
  SystemMetricsSnapshot,
  TempCleanupPreview,
  WatchdogCategory,
  WatchdogEvent,
  WatchdogSeverity
} from '@shared/models';
import { DEFAULT_APP_SETTINGS } from '@shared/models';

import {
  ActionToasts,
  type ActionToastItem
} from './components/ActionToasts';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EventDetailPanel } from './components/EventDetailPanel';
import { EventFilters } from './components/EventFilters';
import { EventTimeline } from './components/EventTimeline';
import { MetricCard } from './components/MetricCard';
import { ProcessDetailPanel } from './components/ProcessDetailPanel';
import { ProcessesTable } from './components/ProcessesTable';
import { ServicesPanel } from './components/ServicesPanel';
import { SettingsView } from './components/SettingsView';
import { StartupItemsPanel } from './components/StartupItemsPanel';
import { SystemStatisticsPanel } from './components/SystemStatisticsPanel';
import { TelemetryTrendsPanel } from './components/TelemetryTrendsPanel';
import { TempCleanupPanel } from './components/TempCleanupPanel';
import { WorkloadInsightsPanel } from './components/WorkloadInsightsPanel';
import {
  formatBytes,
  formatClock,
  formatCount,
  formatGigahertz,
  formatPercentage,
  formatRate,
  formatTemperature
} from './utils/formatters';

type AppView = 'overview' | 'tools' | 'settings';

type LoadingState = {
  snapshot: boolean;
  events: boolean;
  startupItems: boolean;
  services: boolean;
  settings: boolean;
  tempPreview: boolean;
};

const PLATFORM_LABELS: Record<SystemMetricsSnapshot['platform'], string> = {
  windows: 'Windows 11 user-space profile',
  macos: 'macOS fallback profile',
  linux: 'Linux fallback profile',
  unknown: 'Generic fallback profile'
};

const VIEW_COPY: Record<
  AppView,
  {
    title: string;
    description: string;
    helper: string;
  }
> = {
  overview: {
    title: 'System awareness, without guesswork',
    description:
      'See live CPU, memory, disk, network, process, and watchdog activity in one transparent dashboard.',
    helper:
      'Use this view to understand what is happening now and whether the system still looks normal.'
  },
  tools: {
    title: 'Targeted repair tools',
    description:
      'Run user-invoked cleanup and recovery actions with confirmation, clear results, and no hidden automation.',
    helper:
      'Every action stays visible, explicit, and reversible where the OS allows it.'
  },
  settings: {
    title: 'Thresholds and monitor coverage',
    description:
      'Tune how Sovereign scores pressure and choose which watchdog feeds stay active while the app is open.',
    helper:
      'Settings change Sovereign’s own guidance. They do not install drivers, persistence, or background agents.'
  }
};

const NAV_ITEMS: Array<{ id: AppView; label: string; description: string }> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Live metrics, process pressure, and recent events'
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Explicit cleanup, process, startup, and service actions'
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Thresholds, toggles, and local dashboard preferences'
  }
];

const EMPTY_ACTIONS = ['Connecting to the first live telemetry sample.'];

type ConfirmationState =
  | {
      kind: 'kill-process';
      title: string;
      description: string;
      confirmLabel: string;
      process: ProcessInfo;
    }
  | {
      kind: 'disable-startup-item';
      title: string;
      description: string;
      confirmLabel: string;
      startupItem: StartupItem;
    }
  | {
      kind: 'restart-service';
      title: string;
      description: string;
      confirmLabel: string;
      service: ServiceSummary;
    }
  | {
      kind: 'temp-cleanup';
      title: string;
      description: string;
      confirmLabel: string;
      preview: TempCleanupPreview;
    };

const createLoadingState = (): LoadingState => ({
  snapshot: true,
  events: true,
  startupItems: true,
  services: true,
  settings: true,
  tempPreview: false
});

const cloneSettings = (settings: AppSettings): AppSettings =>
  JSON.parse(JSON.stringify(settings)) as AppSettings;

const serializeSettings = (settings: AppSettings | null): string =>
  settings ? JSON.stringify(settings) : '';

const matchesSearch = (candidate: string, searchTerm: string): boolean =>
  candidate.toLowerCase().includes(searchTerm);

const getErrorMessage = (cause: unknown, fallbackMessage: string): string =>
  cause instanceof Error ? cause.message : fallbackMessage;

export const App = () => {
  const [activeView, setActiveView] = useState<AppView>('overview');
  const [snapshot, setSnapshot] = useState<SystemMetricsSnapshot | null>(null);
  const [events, setEvents] = useState<WatchdogEvent[]>([]);
  const [startupItems, setStartupItems] = useState<StartupItem[]>([]);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [tempPreview, setTempPreview] = useState<TempCleanupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsSaveMessage, setSettingsSaveMessage] = useState<string | null>(null);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>(createLoadingState);
  const [severityFilter, setSeverityFilter] = useState<'all' | WatchdogSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WatchdogCategory>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedProcessPid, setSelectedProcessPid] = useState<number | null>(null);
  const [startupSearch, setStartupSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [toasts, setToasts] = useState<ActionToastItem[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const setLoadingState = (key: keyof LoadingState, value: boolean): void => {
    setLoading((currentState) => ({
      ...currentState,
      [key]: value
    }));
  };

  const applySnapshot = (nextSnapshot: SystemMetricsSnapshot): void => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setSelectedProcessPid((currentSelection) =>
        nextSnapshot.topProcesses.some((process) => process.pid === currentSelection)
          ? currentSelection
          : nextSnapshot.topProcesses[0]?.pid || null
      );
    });
  };

  const applyEvents = (nextEvents: WatchdogEvent[]): void => {
    startTransition(() => {
      setEvents(nextEvents);
      setSelectedEventId((currentSelection) =>
        nextEvents.some((event) => event.id === currentSelection)
          ? currentSelection
          : nextEvents[0]?.id || null
      );
    });
  };

  const applySettings = (nextSettings: AppSettings): void => {
    const clonedSettings = cloneSettings(nextSettings);

    startTransition(() => {
      setSettings(clonedSettings);
      setSettingsDraft(cloneSettings(clonedSettings));
    });
  };

  const loadSnapshot = async (): Promise<void> => {
    setLoadingState('snapshot', true);

    try {
      const nextSnapshot = await window.sovereign.getDashboardSnapshot();
      applySnapshot(nextSnapshot);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to load the dashboard telemetry.'));
    } finally {
      setLoadingState('snapshot', false);
    }
  };

  const loadEvents = async (): Promise<void> => {
    setLoadingState('events', true);

    try {
      const recentEvents = await window.sovereign.listRecentEvents({
        limit: settings?.timelineEventLimit ?? DEFAULT_APP_SETTINGS.timelineEventLimit,
        severities: severityFilter === 'all' ? undefined : [severityFilter],
        categories: categoryFilter === 'all' ? undefined : [categoryFilter]
      });

      applyEvents(recentEvents);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to refresh the watchdog timeline.'));
    } finally {
      setLoadingState('events', false);
    }
  };

  const loadStartupItems = async (): Promise<void> => {
    setLoadingState('startupItems', true);

    try {
      const nextStartupItems = await window.sovereign.listStartupItems();
      startTransition(() => {
        setStartupItems(nextStartupItems);
      });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to load startup items.'));
    } finally {
      setLoadingState('startupItems', false);
    }
  };

  const loadServices = async (): Promise<void> => {
    setLoadingState('services', true);

    try {
      const nextServices = await window.sovereign.listServices();
      startTransition(() => {
        setServices(nextServices);
      });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to load Windows services.'));
    } finally {
      setLoadingState('services', false);
    }
  };

  const loadSettings = async (): Promise<void> => {
    setLoadingState('settings', true);

    try {
      const nextSettings = await window.sovereign.getSettings();
      applySettings(nextSettings);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to load the local settings.'));
    } finally {
      setLoadingState('settings', false);
    }
  };

  const dismissToast = (toastId: string): void => {
    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== toastId)
    );
  };

  const pushToast = (result: FixActionResult): void => {
    const toast: ActionToastItem = {
      id: result.actionId,
      result
    };

    setToasts((currentToasts) => [toast, ...currentToasts].slice(0, 4));

    window.setTimeout(() => {
      dismissToast(toast.id);
    }, 6_000);
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async (): Promise<void> => {
      await Promise.all([
        loadSettings(),
        loadSnapshot(),
        loadStartupItems(),
        loadServices()
      ]);
    };

    void initialize();

    const unsubscribeDashboard = window.sovereign.onDashboardUpdated((nextSnapshot) => {
      if (!isMounted) {
        return;
      }

      applySnapshot(nextSnapshot);
    });

    const unsubscribeSettings = window.sovereign.onSettingsUpdated((nextSettings) => {
      if (!isMounted) {
        return;
      }

      applySettings(nextSettings);
    });

    return () => {
      isMounted = false;
      unsubscribeDashboard();
      unsubscribeSettings();
    };
  }, []);

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
  }, [severityFilter, categoryFilter, settings?.timelineEventLimit]);

  const handleOpenProcessLocation = async (processInfo: ProcessInfo): Promise<void> => {
    setBusyActionKey('open-process-location');

    try {
      const result = await window.sovereign.openProcessLocation({ process: processInfo });
      pushToast(result);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to open the selected process location.'));
    } finally {
      setBusyActionKey(null);
    }
  };

  const handlePreviewTempCleanup = async (): Promise<void> => {
    setBusyActionKey('preview-temp-cleanup');
    setLoadingState('tempPreview', true);

    try {
      const preview = await window.sovereign.previewTempCleanup();
      startTransition(() => {
        setTempPreview(preview);
      });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to generate a temp cleanup preview.'));
    } finally {
      setLoadingState('tempPreview', false);
      setBusyActionKey(null);
    }
  };

  const handleRefreshDiagnostics = async (): Promise<void> => {
    setBusyActionKey('refresh-diagnostics');

    try {
      const result = await window.sovereign.refreshDiagnostics();
      pushToast(result);
      await Promise.all([
        loadSnapshot(),
        loadEvents(),
        loadStartupItems(),
        loadServices()
      ]);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to refresh diagnostics right now.'));
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleSaveSettings = async (): Promise<void> => {
    if (!settingsDraft) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsSaveError(null);
    setSettingsSaveMessage(null);

    try {
      const nextSettings = await window.sovereign.updateSettings(settingsDraft);
      applySettings(nextSettings);
      setSettingsSaveMessage('Settings saved. Live summaries and watchdog polling were refreshed.');
      await Promise.all([loadSnapshot(), loadEvents()]);
    } catch (cause) {
      setSettingsSaveError(getErrorMessage(cause, 'Unable to save the current settings.'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleConfirmedAction = async (): Promise<void> => {
    if (!confirmation) {
      return;
    }

    setBusyActionKey(confirmation.kind);

    try {
      let result: FixActionResult;

      if (confirmation.kind === 'kill-process') {
        result = await window.sovereign.killProcess({
          pid: confirmation.process.pid,
          name: confirmation.process.name
        });
        await loadSnapshot();
      } else if (confirmation.kind === 'disable-startup-item') {
        result = await window.sovereign.disableStartupItem({
          startupItemId: confirmation.startupItem.id
        });
        await Promise.all([loadStartupItems(), loadEvents()]);
      } else if (confirmation.kind === 'restart-service') {
        result = await window.sovereign.restartService({
          serviceName: confirmation.service.name,
          displayName: confirmation.service.displayName
        });
        await Promise.all([loadServices(), loadEvents()]);
      } else {
        result = await window.sovereign.executeTempCleanup({
          previewId: confirmation.preview.previewId,
          entryIds: confirmation.preview.entries.map((entry) => entry.id)
        });
        startTransition(() => {
          setTempPreview(null);
        });
        await loadSnapshot();
      }

      pushToast(result);
      setConfirmation(null);
    } catch (cause) {
      setError(getErrorMessage(cause, 'The requested action could not be completed.'));
    } finally {
      setBusyActionKey(null);
    }
  };

  const deferredProcesses = useDeferredValue(snapshot?.topProcesses ?? []);
  const deferredStartupSearch = useDeferredValue(startupSearch.trim().toLowerCase());
  const deferredServiceSearch = useDeferredValue(serviceSearch.trim().toLowerCase());

  const filteredStartupItems = startupItems
    .filter((item) =>
      deferredStartupSearch
        ? matchesSearch(
            [item.name, item.location, item.command, item.user || ''].join(' '),
            deferredStartupSearch
          )
        : true
    )
    .slice(0, 10);

  const filteredServices = services
    .filter((service) =>
      deferredServiceSearch
        ? matchesSearch(
            [service.displayName, service.name, service.state, service.startMode].join(' '),
            deferredServiceSearch
          )
        : true
    )
    .slice(0, 10);

  const showTelemetrySummaries =
    settings?.enableTelemetrySummaries ?? DEFAULT_APP_SETTINGS.enableTelemetrySummaries;
  const healthStatus = snapshot?.health.status ?? 'healthy';
  const healthHeadline = showTelemetrySummaries
    ? snapshot?.health.headline || 'Connecting telemetry'
    : snapshot
      ? 'Live telemetry connected'
      : 'Connecting telemetry';
  const healthSummary = showTelemetrySummaries
    ? snapshot?.health.summary ||
      'The dashboard will populate once the main process completes its first telemetry sample.'
    : snapshot
      ? 'Live metrics and watchdog polling remain active. Narrative guidance is currently hidden in settings.'
      : 'Connecting to live metrics and local dashboard services.';
  const healthActions = showTelemetrySummaries
    ? snapshot?.health.actions ?? EMPTY_ACTIONS
    : ['Narrative metric guidance is hidden in Settings.'];
  const networkGaugeMax =
    settings?.thresholds.network.stressedBytesPerSec ??
    DEFAULT_APP_SETTINGS.thresholds.network.stressedBytesPerSec;
  const networkUsagePercent = snapshot
    ? Math.min((snapshot.network.totalBytesPerSec / networkGaugeMax) * 100, 100)
    : 0;
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedProcess =
    deferredProcesses.find((process) => process.pid === selectedProcessPid) ??
    deferredProcesses[0] ??
    null;
  const busiestNetworkInterface = snapshot?.network.interfaces[0] ?? null;
  const suspiciousEventCount = events.filter((event) => event.severity === 'suspicious').length;
  const unusualEventCount = events.filter((event) => event.severity === 'unusual').length;
  const enabledMonitorCount = settings
    ? Object.values(settings.monitors).filter(Boolean).length
    : 0;
  const hasUnsavedSettings =
    serializeSettings(settingsDraft) !== serializeSettings(settings);
  const actionsDisabled = Boolean(busyActionKey) || isSavingSettings;
  const cpuDetailParts = snapshot
    ? [
        `${snapshot.cpu.coreCount} logical cores`,
        snapshot.cpu.speedGHz ? formatGigahertz(snapshot.cpu.speedGHz) : null,
        snapshot.cpu.temperatureC ? formatTemperature(snapshot.cpu.temperatureC) : null,
        snapshot.cpu.loadAverage.some((value) => value > 0)
          ? `load avg ${snapshot.cpu.loadAverage.map((value) => value.toFixed(2)).join(' / ')}`
          : null
      ].filter(Boolean)
    : [];
  const memoryDetailParts = snapshot
    ? [
        `${formatPercentage(snapshot.memory.usagePercent)} committed`,
        `${formatBytes(snapshot.memory.availableBytes)} available`,
        snapshot.memory.swapTotalBytes > 0
          ? `${formatBytes(snapshot.memory.swapUsedBytes)} swap`
          : null
      ].filter(Boolean)
    : [];
  const diskDetailParts = snapshot
    ? [
        `${snapshot.disk.volumes.length} tracked volume${
          snapshot.disk.volumes.length === 1 ? '' : 's'
        }`,
        `${formatRate(snapshot.disk.io.readBytesPerSec)} read`,
        `${formatRate(snapshot.disk.io.writeBytesPerSec)} write`
      ]
    : [];
  const networkDetailParts = snapshot
    ? [
        `${snapshot.network.activeInterfaces} active interface${
          snapshot.network.activeInterfaces === 1 ? '' : 's'
        }`,
        busiestNetworkInterface
          ? `${busiestNetworkInterface.name} ${formatRate(
              busiestNetworkInterface.totalBytesPerSec
            )}`
          : null,
        `${formatRate(snapshot.network.totalBytesPerSec)} combined`
      ].filter(Boolean)
    : [];

  const heroStats =
    activeView === 'overview'
      ? [
          {
            label: 'Recent suspicious events',
            value: formatCount(suspiciousEventCount),
            detail: `${unusualEventCount} unusual in the current timeline view`
          },
          {
            label: 'Process census',
            value: snapshot ? formatCount(snapshot.runtime.processTotals.total) : 'Loading',
            detail: snapshot
              ? `${formatCount(snapshot.runtime.processTotals.running)} running · ${formatCount(
                  snapshot.runtime.processTotals.sleeping
                )} sleeping`
              : 'Waiting for the process inventory'
          },
          {
            label: 'Watchdog coverage',
            value: settings ? `${enabledMonitorCount}/4 feeds` : 'Loading',
            detail: snapshot
              ? PLATFORM_LABELS[snapshot.platform]
              : 'Determining the platform profile'
          }
        ]
      : activeView === 'tools'
        ? [
            {
              label: 'Temp preview',
              value: tempPreview ? `${tempPreview.itemCount} items` : 'Not generated',
              detail: tempPreview
                ? `${formatBytes(tempPreview.totalBytes)} reclaimable`
                : 'Preview before cleanup'
            },
            {
              label: 'Startup inventory',
              value: `${startupItems.length}`,
              detail: filteredStartupItems.length
                ? `${filteredStartupItems.length} shown after filtering`
                : 'No startup items currently visible'
            },
            {
              label: 'Service inventory',
              value: `${services.length}`,
              detail: filteredServices.length
                ? `${filteredServices.length} shown after filtering`
                : 'No services currently visible'
            }
          ]
        : [
            {
              label: 'Monitors enabled',
              value: settings ? `${enabledMonitorCount}/4` : 'Loading',
              detail: 'These toggles only affect in-app polling'
            },
            {
              label: 'Timeline limit',
              value: `${settings?.timelineEventLimit ?? DEFAULT_APP_SETTINGS.timelineEventLimit}`,
              detail: 'Recent events rendered at once'
            },
            {
              label: 'Network stressed threshold',
              value: settings
                ? formatRate(settings.thresholds.network.stressedBytesPerSec)
                : formatRate(DEFAULT_APP_SETTINGS.thresholds.network.stressedBytesPerSec),
              detail: 'Used for Sovereign’s own guidance language'
            }
          ];

  const renderOverview = () => (
    <>
      <section className="metrics-grid">
        <MetricCard
          title="CPU"
          value={snapshot ? `${formatPercentage(snapshot.cpu.usagePercent)} in use` : 'Loading'}
          detail={
            snapshot
              ? cpuDetailParts.join(' · ')
              : 'Collecting live processor data'
          }
          insight={
            showTelemetrySummaries
              ? snapshot?.cpu.advice.headline || 'Sampling the processor telemetry service'
              : 'Processor telemetry is active'
          }
          action={
            showTelemetrySummaries
              ? snapshot?.cpu.advice.action || 'Waiting for the first snapshot'
              : 'Narrative guidance is hidden in Settings.'
          }
          usagePercent={snapshot?.cpu.usagePercent || 0}
          status={snapshot?.cpu.status || 'healthy'}
        />

        <MetricCard
          title="Memory"
          value={
            snapshot
              ? `${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(
                  snapshot.memory.totalBytes
                )}`
              : 'Loading'
          }
          detail={
            snapshot ? memoryDetailParts.join(' · ') : 'Collecting live memory data'
          }
          insight={
            showTelemetrySummaries
              ? snapshot?.memory.advice.headline || 'Waiting for memory telemetry'
              : 'Memory telemetry is active'
          }
          action={
            showTelemetrySummaries
              ? snapshot?.memory.advice.action || 'Waiting for the first snapshot'
              : 'Narrative guidance is hidden in Settings.'
          }
          usagePercent={snapshot?.memory.usagePercent || 0}
          status={snapshot?.memory.status || 'healthy'}
        />

        <MetricCard
          title="Disk"
          value={
            snapshot
              ? `${formatBytes(snapshot.disk.usedBytes)} / ${formatBytes(snapshot.disk.totalBytes)}`
              : 'Loading'
          }
          detail={
            snapshot ? diskDetailParts.join(' · ') : 'Collecting storage telemetry'
          }
          insight={
            showTelemetrySummaries
              ? snapshot?.disk.advice.headline || 'Waiting for storage telemetry'
              : 'Storage telemetry is active'
          }
          action={
            showTelemetrySummaries
              ? snapshot?.disk.advice.action || 'Waiting for the first snapshot'
              : 'Narrative guidance is hidden in Settings.'
          }
          usagePercent={snapshot?.disk.usagePercent || 0}
          status={snapshot?.disk.status || 'healthy'}
        />

        <MetricCard
          title="Network"
          value={
            snapshot
              ? `${formatRate(snapshot.network.receiveBytesPerSec)} down · ${formatRate(
                  snapshot.network.transmitBytesPerSec
                )} up`
              : 'Loading'
          }
          detail={
            snapshot ? networkDetailParts.join(' · ') : 'Collecting network telemetry'
          }
          insight={
            showTelemetrySummaries
              ? snapshot?.network.advice.headline || 'Waiting for network telemetry'
              : 'Network telemetry is active'
          }
          action={
            showTelemetrySummaries
              ? snapshot?.network.advice.action || 'Waiting for the first snapshot'
              : 'Narrative guidance is hidden in Settings.'
          }
          usagePercent={networkUsagePercent}
          status={snapshot?.network.status || 'healthy'}
        />
      </section>

      <section className="analytics-grid">
        <TelemetryTrendsPanel
          history={snapshot?.history ?? []}
          snapshot={snapshot}
        />

        <SystemStatisticsPanel
          snapshot={snapshot}
          events={events}
        />
      </section>

      <WorkloadInsightsPanel snapshot={snapshot} />

      <section className="overview-grid">
        <div className="stack-column">
          <ProcessesTable
            processes={deferredProcesses}
            selectedProcessPid={selectedProcess?.pid || null}
            isLoading={loading.snapshot}
            actionsDisabled={actionsDisabled}
            onSelectProcess={(processInfo) => {
              setSelectedProcessPid(processInfo.pid);
            }}
            onOpenLocation={(processInfo) => {
              void handleOpenProcessLocation(processInfo);
            }}
            onKillProcess={(processInfo) => {
              setConfirmation({
                kind: 'kill-process',
                title: `End process: ${processInfo.name}`,
                description:
                  'This sends an explicit termination signal to the selected process. Continue only if you understand the impact on the running application.',
                confirmLabel: 'End process',
                process: processInfo
              });
            }}
          />

          <ProcessDetailPanel
            process={selectedProcess}
            actionsDisabled={actionsDisabled}
            onOpenLocation={(processInfo) => {
              void handleOpenProcessLocation(processInfo);
            }}
            onKillProcess={(processInfo) => {
              setConfirmation({
                kind: 'kill-process',
                title: `End process: ${processInfo.name}`,
                description:
                  'This sends an explicit termination signal to the selected process. Continue only if you understand the impact on the running application.',
                confirmLabel: 'End process',
                process: processInfo
              });
            }}
          />
        </div>

        <div className="stack-column">
          <section className="panel timeline-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Recent events</p>
                <h2>Watchdog timeline</h2>
              </div>
              <p className="panel-meta">
                Filters query the local event history so you can separate baseline
                activity from explainable alerts.
              </p>
            </div>

            <EventFilters
              severityFilter={severityFilter}
              categoryFilter={categoryFilter}
              onSeverityChange={setSeverityFilter}
              onCategoryChange={setCategoryFilter}
            />

            <EventTimeline
              events={events}
              selectedEventId={selectedEvent?.id || null}
              isLoading={loading.events}
              emptyMessage="No events match the current filters."
              onSelectEvent={setSelectedEventId}
            />
          </section>

          <EventDetailPanel event={selectedEvent} />
        </div>
      </section>
    </>
  );

  const renderTools = () => (
    <section className="fixer-grid">
      <TempCleanupPanel
        preview={tempPreview}
        actionsDisabled={actionsDisabled}
        isPreviewLoading={loading.tempPreview}
        onPreview={() => {
          void handlePreviewTempCleanup();
        }}
        onExecute={() => {
          if (!tempPreview) {
            return;
          }

          setConfirmation({
            kind: 'temp-cleanup',
            title: 'Clean previewed temp items',
            description:
              'Sovereign will only remove the temp items shown in the current preview. Locked or permission-protected items will be reported instead of silently ignored.',
            confirmLabel: 'Run cleanup',
            preview: tempPreview
          });
        }}
      />

      <StartupItemsPanel
        items={filteredStartupItems}
        searchValue={startupSearch}
        isLoading={loading.startupItems}
        actionsDisabled={actionsDisabled}
        platform={snapshot?.platform || null}
        onSearchChange={setStartupSearch}
        onDisable={(startupItem) => {
          setConfirmation({
            kind: 'disable-startup-item',
            title: `Disable startup item: ${startupItem.name}`,
            description:
              'This removes the selected startup entry from the active startup path. Sovereign records backup metadata locally so the change can be traced later.',
            confirmLabel: 'Disable startup item',
            startupItem
          });
        }}
      />

      <ServicesPanel
        services={filteredServices}
        searchValue={serviceSearch}
        isLoading={loading.services}
        actionsDisabled={actionsDisabled}
        platform={snapshot?.platform || null}
        onSearchChange={setServiceSearch}
        onRestart={(service) => {
          setConfirmation({
            kind: 'restart-service',
            title: `Restart service: ${service.displayName}`,
            description:
              'This asks Windows to restart the selected service. Permission failures or service-control errors will be reported clearly.',
            confirmLabel: 'Restart service',
            service
          });
        }}
      />
    </section>
  );

  return (
    <main className="app-shell">
      <aside className="panel rail-panel">
        <div className="brand-block">
          <div className="brand-mark">S</div>
          <div className="brand-copy">
            <p className="section-kicker">Continental / Placeholder brand</p>
            <h2>Sovereign</h2>
            <p>Transparent system control center for Windows operations.</p>
          </div>
        </div>

        <nav className="view-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-button ${activeView === item.id ? 'selected' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>

        <section className="rail-card">
          <p className="section-kicker">Current posture</p>
          <span className={`status-pill status-${healthStatus}`}>{healthHeadline}</span>
          <p className="rail-copy">
            {snapshot
              ? `${PLATFORM_LABELS[snapshot.platform]} · refreshed ${formatClock(
                  snapshot.collectedAt
                )}`
              : 'Connecting to live telemetry and the local event store.'}
          </p>
        </section>

        <section className="rail-card">
          <p className="section-kicker">Trust model</p>
          <ul className="rail-list">
            <li>Visible, user-invoked actions only.</li>
            <li>Heuristics stay explainable and non-destructive.</li>
            <li>Windows-only gaps are reported honestly.</li>
          </ul>
        </section>
      </aside>

      <div className="app-content">
        <header className="panel hero-panel">
          <div className="hero-copy">
            <p className="section-kicker">Sovereign command center</p>
            <h1>{VIEW_COPY[activeView].title}</h1>
            <p className="hero-description">{VIEW_COPY[activeView].description}</p>
            <p className="hero-helper">{VIEW_COPY[activeView].helper}</p>
          </div>

          <div className="hero-stats">
            {heroStats.map((stat) => (
              <article
                key={stat.label}
                className="hero-stat"
              >
                <p className="detail-label">{stat.label}</p>
                <h2>{stat.value}</h2>
                <p>{stat.detail}</p>
              </article>
            ))}
          </div>
        </header>

        {error ? (
          <section className="panel error-banner">
            <p className="section-kicker">Attention</p>
            <h2>One or more data feeds need attention.</h2>
            <p>{error}</p>
          </section>
        ) : null}

        <section className="panel control-panel">
          <div>
            <p className="section-kicker">Current summary</p>
            <h2>{healthHeadline}</h2>
            <p className="control-copy">{healthSummary}</p>
            <ul className="action-list">
              {healthActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>

          <div className="control-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void handleRefreshDiagnostics();
              }}
              disabled={actionsDisabled}
            >
              Refresh diagnostics
            </button>
            {activeView !== 'settings' ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveView('settings')}
                disabled={actionsDisabled}
              >
                Open settings
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveView('overview')}
                disabled={actionsDisabled}
              >
                Back to overview
              </button>
            )}
          </div>
        </section>

        {activeView === 'overview'
          ? renderOverview()
          : activeView === 'tools'
            ? renderTools()
            : (
              <SettingsView
                settings={settingsDraft}
                platform={snapshot?.platform || 'unknown'}
                isLoading={loading.settings}
                isSaving={isSavingSettings}
                hasUnsavedChanges={hasUnsavedSettings}
                saveMessage={settingsSaveMessage}
                saveError={settingsSaveError}
                onChange={(nextSettings) => {
                  setSettingsDraft(cloneSettings(nextSettings));
                  setSettingsSaveMessage(null);
                  setSettingsSaveError(null);
                }}
                onSave={() => {
                  void handleSaveSettings();
                }}
                onReset={() => {
                  setSettingsDraft(cloneSettings(DEFAULT_APP_SETTINGS));
                  setSettingsSaveMessage('Default values staged. Save to apply them.');
                  setSettingsSaveError(null);
                }}
              />
            )}
      </div>

      <ActionToasts
        toasts={toasts}
        onDismiss={dismissToast}
      />

      {confirmation ? (
        <ConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          busy={Boolean(busyActionKey)}
          onCancel={() => {
            if (!busyActionKey) {
              setConfirmation(null);
            }
          }}
          onConfirm={() => {
            void handleConfirmedAction();
          }}
        />
      ) : null}
    </main>
  );
};
