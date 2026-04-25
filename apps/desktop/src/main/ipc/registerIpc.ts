import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc';
import type { AppSettings } from '@shared/models';
import type { DashboardService } from '@main/services/dashboardService';
import type { EventStore } from '@main/store/eventStore';
import type { SettingsStore } from '@main/store/settingsStore';
import type { FixerService } from '@main/fixer/fixerService';
import type { WatchdogService } from '@main/watchdog/watchdogService';
import {
  validateDisableStartupItemRequest,
  validateEventsListRequest,
  validateExecuteTempCleanupRequest,
  validateKillProcessRequest,
  validateListActionHistoryRequest,
  validateOpenProcessLocationRequest,
  validateRestartServiceRequest,
  validateRestoreStartupItemRequest,
  validateRunUtilityActionRequest,
  validateStartServiceRequest,
  validateStopServiceRequest,
  validateUpdateSettingsRequest
} from './validation';

interface RegisterIpcDependencies {
  dashboardService: DashboardService;
  eventStore: EventStore;
  settingsStore: SettingsStore;
  fixerService: FixerService;
  watchdogService: WatchdogService;
  onSettingsUpdated: (settings: AppSettings) => void;
}

const HANDLED_CHANNELS = [
  IPC_CHANNELS.dashboard.getSnapshot,
  IPC_CHANNELS.watchdog.getMonitorStatuses,
  IPC_CHANNELS.events.list,
  IPC_CHANNELS.settings.get,
  IPC_CHANNELS.settings.update,
  IPC_CHANNELS.fixer.previewTempCleanup,
  IPC_CHANNELS.fixer.executeTempCleanup,
  IPC_CHANNELS.fixer.killProcess,
  IPC_CHANNELS.fixer.openProcessLocation,
  IPC_CHANNELS.fixer.listStartupItems,
  IPC_CHANNELS.fixer.listStartupBackups,
  IPC_CHANNELS.fixer.disableStartupItem,
  IPC_CHANNELS.fixer.restoreStartupItem,
  IPC_CHANNELS.fixer.listServices,
  IPC_CHANNELS.fixer.startService,
  IPC_CHANNELS.fixer.stopService,
  IPC_CHANNELS.fixer.restartService,
  IPC_CHANNELS.fixer.listActionHistory,
  IPC_CHANNELS.fixer.runUtilityAction,
  IPC_CHANNELS.fixer.refreshDiagnostics
] as const;

export const registerIpcHandlers = ({
  dashboardService,
  eventStore,
  settingsStore,
  fixerService,
  watchdogService,
  onSettingsUpdated
}: RegisterIpcDependencies): void => {
  for (const channel of HANDLED_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(IPC_CHANNELS.dashboard.getSnapshot, async () =>
    dashboardService.getSnapshot()
  );

  ipcMain.handle(IPC_CHANNELS.watchdog.getMonitorStatuses, async () =>
    watchdogService.getMonitorStatuses()
  );

  ipcMain.handle(
    IPC_CHANNELS.events.list,
    async (_event, request: unknown) =>
      eventStore.list(validateEventsListRequest(request))
  );

  ipcMain.handle(IPC_CHANNELS.settings.get, async () => settingsStore.getSettings());

  ipcMain.handle(
    IPC_CHANNELS.settings.update,
    async (_event, request: unknown) => {
      const validatedRequest = validateUpdateSettingsRequest(request);
      const settings = await settingsStore.updateSettings(validatedRequest);
      await watchdogService.updateSettings(settings);
      dashboardService.updateSettings(settings);
      await dashboardService.refreshNow();
      onSettingsUpdated(settings);
      return settings;
    }
  );

  ipcMain.handle(IPC_CHANNELS.fixer.previewTempCleanup, async () =>
    fixerService.previewTempCleanup()
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.executeTempCleanup,
    async (_event, request: unknown) =>
      fixerService.executeTempCleanup(validateExecuteTempCleanupRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.killProcess,
    async (_event, request: unknown) =>
      fixerService.killProcess(validateKillProcessRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.openProcessLocation,
    async (_event, request: unknown) =>
      fixerService.openProcessLocation(validateOpenProcessLocationRequest(request))
  );

  ipcMain.handle(IPC_CHANNELS.fixer.listStartupItems, async () =>
    fixerService.listStartupItems()
  );

  ipcMain.handle(IPC_CHANNELS.fixer.listStartupBackups, async () =>
    fixerService.listStartupBackups()
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.disableStartupItem,
    async (_event, request: unknown) =>
      fixerService.disableStartupItem(validateDisableStartupItemRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.restoreStartupItem,
    async (_event, request: unknown) =>
      fixerService.restoreStartupItem(validateRestoreStartupItemRequest(request))
  );

  ipcMain.handle(IPC_CHANNELS.fixer.listServices, async () =>
    fixerService.listServices()
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.startService,
    async (_event, request: unknown) =>
      fixerService.startService(validateStartServiceRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.stopService,
    async (_event, request: unknown) =>
      fixerService.stopService(validateStopServiceRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.restartService,
    async (_event, request: unknown) =>
      fixerService.restartService(validateRestartServiceRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.listActionHistory,
    async (_event, request: unknown) =>
      fixerService.listActionHistory(validateListActionHistoryRequest(request))
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.runUtilityAction,
    async (_event, request: unknown) =>
      fixerService.runUtilityAction(validateRunUtilityActionRequest(request))
  );

  ipcMain.handle(IPC_CHANNELS.fixer.refreshDiagnostics, async () =>
    fixerService.refreshDiagnostics()
  );
};
