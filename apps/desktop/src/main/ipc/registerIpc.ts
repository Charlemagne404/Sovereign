import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc';
import type {
  DisableStartupItemRequest,
  EventsListRequest,
  ExecuteTempCleanupRequest,
  KillProcessRequest,
  OpenProcessLocationRequest,
  RestartServiceRequest,
  UpdateSettingsRequest
} from '@shared/ipc';
import type { AppSettings } from '@shared/models';
import type { DashboardService } from '@main/services/dashboardService';
import type { EventStore } from '@main/store/eventStore';
import type { SettingsStore } from '@main/store/settingsStore';
import type { FixerService } from '@main/fixer/fixerService';
import type { WatchdogService } from '@main/watchdog/watchdogService';

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
  IPC_CHANNELS.events.list,
  IPC_CHANNELS.settings.get,
  IPC_CHANNELS.settings.update,
  IPC_CHANNELS.fixer.previewTempCleanup,
  IPC_CHANNELS.fixer.executeTempCleanup,
  IPC_CHANNELS.fixer.killProcess,
  IPC_CHANNELS.fixer.openProcessLocation,
  IPC_CHANNELS.fixer.listStartupItems,
  IPC_CHANNELS.fixer.disableStartupItem,
  IPC_CHANNELS.fixer.listServices,
  IPC_CHANNELS.fixer.restartService,
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

  ipcMain.handle(
    IPC_CHANNELS.events.list,
    async (_event, request: EventsListRequest | undefined) =>
      eventStore.list(request)
  );

  ipcMain.handle(IPC_CHANNELS.settings.get, async () => settingsStore.getSettings());

  ipcMain.handle(
    IPC_CHANNELS.settings.update,
    async (_event, request: UpdateSettingsRequest) => {
      const settings = await settingsStore.updateSettings(request);
      await watchdogService.updateSettings(settings);
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
    async (_event, request: ExecuteTempCleanupRequest) =>
      fixerService.executeTempCleanup(request)
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.killProcess,
    async (_event, request: KillProcessRequest) => fixerService.killProcess(request)
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.openProcessLocation,
    async (_event, request: OpenProcessLocationRequest) =>
      fixerService.openProcessLocation(request)
  );

  ipcMain.handle(IPC_CHANNELS.fixer.listStartupItems, async () =>
    fixerService.listStartupItems()
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.disableStartupItem,
    async (_event, request: DisableStartupItemRequest) =>
      fixerService.disableStartupItem(request)
  );

  ipcMain.handle(IPC_CHANNELS.fixer.listServices, async () =>
    fixerService.listServices()
  );

  ipcMain.handle(
    IPC_CHANNELS.fixer.restartService,
    async (_event, request: RestartServiceRequest) =>
      fixerService.restartService(request)
  );

  ipcMain.handle(IPC_CHANNELS.fixer.refreshDiagnostics, async () =>
    fixerService.refreshDiagnostics()
  );
};
