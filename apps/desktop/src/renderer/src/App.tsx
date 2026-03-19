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

import { ActionToasts, type ActionToastItem } from './components/ActionToasts';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EventDetailPanel } from './components/EventDetailPanel';
import { EventFilters } from './components/EventFilters';
import { EventTimeline } from './components/EventTimeline';
import { MetricCard } from './components/MetricCard';
import { ProcessDetailPanel } from './components/ProcessDetailPanel';
import { ProcessesTable } from './components/ProcessesTable';
import { QuickActionsPanel } from './components/QuickActionsPanel';
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

type AppView = 'dashboard' | 'investigate' | 'actions' | 'settings';
type UtilityActionId = 'flush-dns' | 'restart-explorer' | 'empty-recycle-bin';
type QuickActionId = 'refresh-diagnostics' | 'preview-temp-cleanup' | UtilityActionId;

type LoadingState = {
  snapshot: boolean;
  events: boolean;
  startupItems: boolean;
  services: boolean;
  settings: boolean;
  tempPreview: boolean;
};

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
      kind: 'start-service' | 'stop-service' | 'restart-service';
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
    }
  | {
      kind: 'utility-action';
      title: string;
      description: string;
      confirmLabel: string;
      action: UtilityActionId;
    };

const PLATFORM_LABELS: Record<SystemMetricsSnapshot['platform'], string> = {
  windows: 'Windows 11 user-space profile',
  macos: 'macOS fallback profile',
  linux: 'Linux fallback profile',
  unknown: 'Generic fallback profile'
};

const VIEW_COPY: Record<AppView, { title: string; description: string; helper: string }> = {
  dashboard: {
    title: 'Live system posture at a glance',
    description:
      'Start with a compact system summary instead of a wall of unrelated panels.',
    helper:
      'Use Dashboard for overall load, health guidance, and trend context before drilling into details.'
  },
  investigate: {
    title: 'Process and event triage',
    description:
      'Filter active processes and recent watchdog events in a workspace built for investigation.',
    helper:
      'Use Investigate when you need to decide what changed, what looks unusual, and what to do next.'
  },
  actions: {
    title: 'Action center for useful fixes',
    description:
      'Run quick recovery tasks and targeted control actions instead of just observing the machine.',
    helper:
      'All actions remain user-invoked, visible, and explicit about permissions or Windows-side failures.'
  },
  settings: {
    title: 'Thresholds and monitor coverage',
    description:
      'Tune how Sovereign scores pressure and choose which watchdog feeds stay active while the app is open.',
    helper:
      "Settings change Sovereign's own guidance. They do not install drivers, persistence, or background agents."
  }
};

const NAV_ITEMS: Array<{ id: AppView; label: string; description: string }> = [
  { id: 'dashboard', label: 'Dashboard', description: 'Live load, trends, and overall posture' },
  { id: 'investigate', label: 'Investigate', description: 'Processes, timeline filters, and drill-down detail' },
  { id: 'actions', label: 'Actions', description: 'Quick repair tasks plus startup and service controls' },
  { id: 'settings', label: 'Settings', description: 'Thresholds, toggles, and dashboard preferences' }
];

const QUICK_ACTIONS = [
  {
    id: 'refresh-diagnostics',
    title: 'Refresh diagnostics',
    description: 'Re-poll telemetry, watchdog providers, and inventories now.',
    detail: 'Useful after making system changes outside the app.'
  },
  {
    id: 'preview-temp-cleanup',
    title: 'Preview temp cleanup',
    description: 'Build a safe deletion preview before removing temporary files.',
    detail: 'Keeps cleanup explicit instead of deleting first and reporting later.'
  },
  {
    id: 'flush-dns',
    title: 'Flush DNS cache',
    description: 'Clear the local DNS resolver cache for name-resolution issues.',
    detail: 'Useful after network changes or stale DNS responses.'
  },
  {
    id: 'restart-explorer',
    title: 'Restart Explorer',
    description: 'Restart the Windows shell without rebooting the machine.',
    detail: 'Useful when the taskbar, desktop, or file shell is misbehaving.',
    tone: 'caution'
  },
  {
    id: 'empty-recycle-bin',
    title: 'Empty recycle bin',
    description: 'Remove currently discarded items using the standard Windows recycle-bin command.',
    detail: 'Reclaims space, but the deleted contents cannot be restored from the bin.',
    tone: 'caution'
  }
] as const;

const EMPTY_ACTIONS = ['Connecting to the first live telemetry sample.'];

const createLoadingState = (): LoadingState => ({
  snapshot: true,
  events: true,
  startupItems: false,
  services: false,
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
  const [activeView, setActiveView] = useState<AppView>('dashboard');
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
  const [processSearch, setProcessSearch] = useState('');
  const [startupSearch, setStartupSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [toasts, setToasts] = useState<ActionToastItem[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const setLoadingState = (key: keyof LoadingState, value: boolean): void => {
    setLoading((currentState) => ({ ...currentState, [key]: value }));
  };

  const applySnapshot = (nextSnapshot: SystemMetricsSnapshot): void => {
    startTransition(() => {
      setError(null);
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
      setError(null);
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
      setError(null);
      setSettings(clonedSettings);
      setSettingsDraft(cloneSettings(clonedSettings));
    });
  };

  const loadSnapshot = async (): Promise<void> => {
    setLoadingState('snapshot', true);

    try {
      applySnapshot(await window.sovereign.getDashboardSnapshot());
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to load the dashboard telemetry.'));
    } finally {
      setLoadingState('snapshot', false);
    }
  };

  const loadEvents = async (): Promise<void> => {
    setLoadingState('events', true);

    try {
      applyEvents(
        await window.sovereign.listRecentEvents({
          limit: settings?.timelineEventLimit ?? DEFAULT_APP_SETTINGS.timelineEventLimit,
          severities: severityFilter === 'all' ? undefined : [severityFilter],
          categories: categoryFilter === 'all' ? undefined : [categoryFilter]
        })
      );
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
        setError(null);
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
        setError(null);
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
      applySettings(await window.sovereign.getSettings());
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to load the local settings.'));
    } finally {
      setLoadingState('settings', false);
    }
  };

  const dismissToast = (toastId: string): void => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  };

  const pushToast = (result: FixActionResult): void => {
    const toast: ActionToastItem = { id: result.actionId, result };
    setToasts((currentToasts) => [toast, ...currentToasts].slice(0, 4));
    window.setTimeout(() => dismissToast(toast.id), 6_000);
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async (): Promise<void> => {
      await Promise.allSettled([loadSettings(), loadSnapshot()]);
    };

    void initialize();

    const unsubscribeDashboard = window.sovereign.onDashboardUpdated((nextSnapshot) => {
      if (isMounted) {
        applySnapshot(nextSnapshot);
      }
    });

    const unsubscribeSettings = window.sovereign.onSettingsUpdated((nextSettings) => {
      if (isMounted) {
        applySettings(nextSettings);
      }
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
      if (isMounted) {
        await loadEvents();
      }
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

  useEffect(() => {
    if (activeView !== 'actions') {
      return;
    }

    if (!loading.startupItems && startupItems.length > 0 && !loading.services && services.length > 0) {
      return;
    }

    void Promise.allSettled([loadStartupItems(), loadServices()]);
  }, [activeView]);

  const handleOpenProcessLocation = async (processInfo: ProcessInfo): Promise<void> => {
    setBusyActionKey('open-process-location');

    try {
      pushToast(await window.sovereign.openProcessLocation({ process: processInfo }));
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
      pushToast(await window.sovereign.refreshDiagnostics());
      await Promise.all([loadSnapshot(), loadEvents(), loadStartupItems(), loadServices()]);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to refresh diagnostics right now.'));
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleRunUtilityAction = async (action: UtilityActionId): Promise<void> => {
    setBusyActionKey(action);

    try {
      pushToast(await window.sovereign.runUtilityAction({ action }));
      await Promise.allSettled([loadSnapshot(), loadEvents(), loadStartupItems(), loadServices()]);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to complete the requested utility action.'));
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleQuickAction = async (actionId: QuickActionId): Promise<void> => {
    if (actionId === 'refresh-diagnostics') {
      await handleRefreshDiagnostics();
      return;
    }

    if (actionId === 'preview-temp-cleanup') {
      await handlePreviewTempCleanup();
      return;
    }

    if (actionId === 'flush-dns') {
      await handleRunUtilityAction(actionId);
      return;
    }

    setConfirmation({
      kind: 'utility-action',
      title: actionId === 'restart-explorer' ? 'Restart Windows Explorer' : 'Empty recycle bin',
      description:
        actionId === 'restart-explorer'
          ? 'This will stop and relaunch the Windows shell. The desktop and taskbar may blink briefly while Explorer starts again.'
          : 'This removes the contents currently in the recycle bin using the standard Windows command. Continue only if you no longer need those discarded items.',
      confirmLabel: actionId === 'restart-explorer' ? 'Restart Explorer' : 'Empty recycle bin',
      action: actionId
    });
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

    setBusyActionKey(confirmation.kind === 'utility-action' ? confirmation.action : confirmation.kind);

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
      } else if (confirmation.kind === 'start-service') {
        result = await window.sovereign.startService({
          serviceName: confirmation.service.name,
          displayName: confirmation.service.displayName
        });
        await Promise.all([loadServices(), loadEvents()]);
      } else if (confirmation.kind === 'stop-service') {
        result = await window.sovereign.stopService({
          serviceName: confirmation.service.name,
          displayName: confirmation.service.displayName
        });
        await Promise.all([loadServices(), loadEvents()]);
      } else if (confirmation.kind === 'restart-service') {
        result = await window.sovereign.restartService({
          serviceName: confirmation.service.name,
          displayName: confirmation.service.displayName
        });
        await Promise.all([loadServices(), loadEvents()]);
      } else if (confirmation.kind === 'temp-cleanup') {
        result = await window.sovereign.executeTempCleanup({
          previewId: confirmation.preview.previewId,
          entryIds: confirmation.preview.entries.map((entry) => entry.id)
        });
        startTransition(() => {
          setTempPreview(null);
        });
        await loadSnapshot();
      } else if (confirmation.kind === 'utility-action') {
        result = await window.sovereign.runUtilityAction({ action: confirmation.action });
        await Promise.allSettled([loadSnapshot(), loadEvents(), loadStartupItems(), loadServices()]);
      } else {
        return;
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
  const deferredProcessSearch = useDeferredValue(processSearch.trim().toLowerCase());
  const deferredStartupSearch = useDeferredValue(startupSearch.trim().toLowerCase());
  const deferredServiceSearch = useDeferredValue(serviceSearch.trim().toLowerCase());

  const filteredProcesses = deferredProcesses.filter((process) =>
    deferredProcessSearch
      ? matchesSearch(
          [process.name, process.path || '', process.user || '', String(process.pid)].join(' '),
          deferredProcessSearch
        )
      : true
  );

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
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedProcess =
    filteredProcesses.find((process) => process.pid === selectedProcessPid) ??
    filteredProcesses[0] ??
    null;
  const busiestNetworkInterface = snapshot?.network.interfaces[0] ?? null;
  const suspiciousEventCount = events.filter((event) => event.severity === 'suspicious').length;
  const unusualEventCount = events.filter((event) => event.severity === 'unusual').length;
  const enabledMonitorCount = settings ? Object.values(settings.monitors).filter(Boolean).length : 0;
  const hasUnsavedSettings = serializeSettings(settingsDraft) !== serializeSettings(settings);
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
        snapshot.memory.swapTotalBytes > 0 ? `${formatBytes(snapshot.memory.swapUsedBytes)} swap` : null
      ].filter(Boolean)
    : [];
  const diskDetailParts = snapshot
    ? [
        `${snapshot.disk.volumes.length} tracked volume${snapshot.disk.volumes.length === 1 ? '' : 's'}`,
        `${formatRate(snapshot.disk.io.readBytesPerSec)} read`,
        `${formatRate(snapshot.disk.io.writeBytesPerSec)} write`
      ]
    : [];
  const networkDetailParts = snapshot
    ? [
        `${snapshot.network.activeInterfaces} active interface${snapshot.network.activeInterfaces === 1 ? '' : 's'}`,
        busiestNetworkInterface
          ? `${busiestNetworkInterface.name} ${formatRate(busiestNetworkInterface.totalBytesPerSec)}`
          : null,
        `${formatRate(snapshot.network.totalBytesPerSec)} combined`
      ].filter(Boolean)
    : [];

  const heroStats =
    activeView === 'dashboard'
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
              ? `${formatCount(snapshot.runtime.processTotals.running)} running, ${formatCount(snapshot.runtime.processTotals.sleeping)} sleeping`
              : 'Waiting for the process inventory'
          },
          {
            label: 'Watchdog coverage',
            value: settings ? `${enabledMonitorCount}/4 feeds` : 'Loading',
            detail: snapshot ? PLATFORM_LABELS[snapshot.platform] : 'Determining the platform profile'
          }
        ]
      : activeView === 'investigate'
        ? [
            {
              label: 'Filtered processes',
              value: formatCount(filteredProcesses.length),
              detail: deferredProcessSearch ? 'Current process filter applied' : 'Showing current ranked process list'
            },
            {
              label: 'Visible events',
              value: formatCount(events.length),
              detail: `${suspiciousEventCount} suspicious, ${unusualEventCount} unusual`
            },
            {
              label: 'Selected focus',
              value: selectedProcess ? selectedProcess.name : selectedEvent?.title || 'Nothing selected',
              detail: selectedProcess
                ? `PID ${selectedProcess.pid}`
                : selectedEvent
                  ? selectedEvent.severity
                  : 'Choose a process or event to inspect'
            }
          ]
        : activeView === 'actions'
          ? [
              {
                label: 'Temp preview',
                value: tempPreview ? `${tempPreview.itemCount} items` : 'Not generated',
                detail: tempPreview ? `${formatBytes(tempPreview.totalBytes)} reclaimable` : 'Build a preview before cleanup'
              },
              {
                label: 'Startup inventory',
                value: formatCount(startupItems.length),
                detail: filteredStartupItems.length ? `${filteredStartupItems.length} shown after filtering` : 'No startup items currently visible'
              },
              {
                label: 'Service inventory',
                value: formatCount(services.length),
                detail: filteredServices.length ? `${filteredServices.length} shown after filtering` : 'No services currently visible'
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
                detail: 'Used for Sovereign guidance language'
              }
            ];

  const renderDashboard = () => (
    <>
      <section className="metrics-grid">
        <MetricCard
          title="CPU"
          value={snapshot ? `${formatPercentage(snapshot.cpu.usagePercent)} in use` : 'Loading'}
          detail={snapshot ? cpuDetailParts.join(' · ') : 'Collecting live processor data'}
          insight={showTelemetrySummaries ? snapshot?.cpu.advice.headline || 'Sampling the processor telemetry service' : 'Processor telemetry is active'}
          action={showTelemetrySummaries ? snapshot?.cpu.advice.action || 'Waiting for the first snapshot' : 'Narrative guidance is hidden in Settings.'}
          usagePercent={snapshot?.cpu.usagePercent || 0}
          status={snapshot?.cpu.status || 'healthy'}
        />
        <MetricCard
          title="Memory"
          value={snapshot ? `${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}` : 'Loading'}
          detail={snapshot ? memoryDetailParts.join(' · ') : 'Collecting live memory data'}
          insight={showTelemetrySummaries ? snapshot?.memory.advice.headline || 'Waiting for memory telemetry' : 'Memory telemetry is active'}
          action={showTelemetrySummaries ? snapshot?.memory.advice.action || 'Waiting for the first snapshot' : 'Narrative guidance is hidden in Settings.'}
          usagePercent={snapshot?.memory.usagePercent || 0}
          status={snapshot?.memory.status || 'healthy'}
        />
        <MetricCard
          title="Disk"
          value={snapshot ? `${formatBytes(snapshot.disk.usedBytes)} / ${formatBytes(snapshot.disk.totalBytes)}` : 'Loading'}
          detail={snapshot ? diskDetailParts.join(' · ') : 'Collecting storage telemetry'}
          insight={showTelemetrySummaries ? snapshot?.disk.advice.headline || 'Waiting for storage telemetry' : 'Storage telemetry is active'}
          action={showTelemetrySummaries ? snapshot?.disk.advice.action || 'Waiting for the first snapshot' : 'Narrative guidance is hidden in Settings.'}
          usagePercent={snapshot?.disk.usagePercent || 0}
          status={snapshot?.disk.status || 'healthy'}
        />
        <MetricCard
          title="Network"
          value={snapshot ? `${formatRate(snapshot.network.receiveBytesPerSec)} down · ${formatRate(snapshot.network.transmitBytesPerSec)} up` : 'Loading'}
          detail={snapshot ? networkDetailParts.join(' · ') : 'Collecting network telemetry'}
          insight={showTelemetrySummaries ? snapshot?.network.advice.headline || 'Waiting for network telemetry' : 'Network telemetry is active'}
          action={showTelemetrySummaries ? snapshot?.network.advice.action || 'Waiting for the first snapshot' : 'Narrative guidance is hidden in Settings.'}
          usagePercent={networkUsagePercent}
          status={snapshot?.network.status || 'healthy'}
        />
      </section>

      <section className="analytics-grid">
        <TelemetryTrendsPanel history={snapshot?.history ?? []} snapshot={snapshot} />
        <SystemStatisticsPanel snapshot={snapshot} events={events} />
      </section>

      <WorkloadInsightsPanel snapshot={snapshot} />
    </>
  );

  const renderInvestigate = () => (
    <section className="overview-grid">
      <div className="stack-column">
        <ProcessesTable
          processes={filteredProcesses}
          selectedProcessPid={selectedProcess?.pid || null}
          isLoading={loading.snapshot}
          actionsDisabled={actionsDisabled}
          searchValue={processSearch}
          onSearchChange={setProcessSearch}
          onSelectProcess={(processInfo) => setSelectedProcessPid(processInfo.pid)}
          onOpenLocation={(processInfo) => { void handleOpenProcessLocation(processInfo); }}
          onKillProcess={(processInfo) => {
            setConfirmation({
              kind: 'kill-process',
              title: `End process: ${processInfo.name}`,
              description: 'This sends an explicit termination signal to the selected process. Continue only if you understand the impact on the running application.',
              confirmLabel: 'End process',
              process: processInfo
            });
          }}
        />
        <ProcessDetailPanel
          process={selectedProcess}
          actionsDisabled={actionsDisabled}
          onOpenLocation={(processInfo) => { void handleOpenProcessLocation(processInfo); }}
          onKillProcess={(processInfo) => {
            setConfirmation({
              kind: 'kill-process',
              title: `End process: ${processInfo.name}`,
              description: 'This sends an explicit termination signal to the selected process. Continue only if you understand the impact on the running application.',
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
              Filters query the local event history so you can separate baseline activity from explainable alerts.
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
  );

  const renderActions = () => (
    <div className="actions-stack">
      <QuickActionsPanel
        actions={QUICK_ACTIONS}
        disabled={actionsDisabled}
        busyActionId={busyActionKey && QUICK_ACTIONS.some((action) => action.id === busyActionKey) ? (busyActionKey as QuickActionId) : null}
        onRun={(actionId) => { void handleQuickAction(actionId); }}
      />

      <section className="fixer-grid">
        <TempCleanupPanel
          preview={tempPreview}
          actionsDisabled={actionsDisabled}
          isPreviewLoading={loading.tempPreview}
          onPreview={() => { void handlePreviewTempCleanup(); }}
          onExecute={() => {
            if (!tempPreview) {
              return;
            }

            setConfirmation({
              kind: 'temp-cleanup',
              title: 'Clean previewed temp items',
              description: 'Sovereign will only remove the temp items shown in the current preview. Locked or permission-protected items will be reported instead of silently ignored.',
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
              description: 'This removes the selected startup entry from the active startup path. Sovereign records backup metadata locally so the change can be traced later.',
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
          onStart={(service) => {
            setConfirmation({
              kind: 'start-service',
              title: `Start service: ${service.displayName}`,
              description: 'This asks Windows to start the selected service now. Permission failures or service-control errors will be reported clearly.',
              confirmLabel: 'Start service',
              service
            });
          }}
          onStop={(service) => {
            setConfirmation({
              kind: 'stop-service',
              title: `Stop service: ${service.displayName}`,
              description: 'This asks Windows to stop the selected service. Continue only if you understand the impact on software that depends on it.',
              confirmLabel: 'Stop service',
              service
            });
          }}
          onRestart={(service) => {
            setConfirmation({
              kind: 'restart-service',
              title: `Restart service: ${service.displayName}`,
              description: 'This asks Windows to restart the selected service. Permission failures or service-control errors will be reported clearly.',
              confirmLabel: 'Restart service',
              service
            });
          }}
        />
      </section>
    </div>
  );

  return (
    <main className="app-shell">
      <div className="shell-backdrop shell-backdrop-left" aria-hidden="true" />
      <div className="shell-backdrop shell-backdrop-right" aria-hidden="true" />

      <aside className="panel rail-panel">
        <div className="brand-block">
          <div className="brand-mark">S</div>
          <div className="brand-copy">
            <p className="section-kicker">Continental Systems</p>
            <h2>Sovereign</h2>
            <p>Transparent Windows control center for system awareness and safe repair actions.</p>
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
            {snapshot ? `${PLATFORM_LABELS[snapshot.platform]} · refreshed ${formatClock(snapshot.collectedAt)}` : 'Connecting to live telemetry and the local event store.'}
          </p>
        </section>

        <section className="rail-card">
          <p className="section-kicker">Workspace guidance</p>
          <ul className="rail-list">
            <li>Dashboard for overall posture and pressure.</li>
            <li>Investigate for process and event triage.</li>
            <li>Actions for actual repair and control tasks.</li>
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
              <article key={stat.label} className="hero-stat">
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
          <div className="control-summary">
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
            <button type="button" className="primary-button" onClick={() => { void handleRefreshDiagnostics(); }} disabled={actionsDisabled}>
              Refresh diagnostics
            </button>
            {activeView !== 'actions' ? (
              <button type="button" className="secondary-button" onClick={() => setActiveView('actions')} disabled={actionsDisabled}>
                Open action center
              </button>
            ) : (
              <button type="button" className="secondary-button" onClick={() => setActiveView('investigate')} disabled={actionsDisabled}>
                Open investigate view
              </button>
            )}
          </div>
        </section>

        {activeView === 'dashboard'
          ? renderDashboard()
          : activeView === 'investigate'
            ? renderInvestigate()
            : activeView === 'actions'
              ? renderActions()
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
                  onSave={() => { void handleSaveSettings(); }}
                  onReset={() => {
                    setSettingsDraft(cloneSettings(DEFAULT_APP_SETTINGS));
                    setSettingsSaveMessage('Default values staged. Save to apply them.');
                    setSettingsSaveError(null);
                  }}
                />
              )}
      </div>

      <ActionToasts toasts={toasts} onDismiss={dismissToast} />

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
          onConfirm={() => { void handleConfirmedAction(); }}
        />
      ) : null}
    </main>
  );
};
