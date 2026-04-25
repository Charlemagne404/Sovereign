import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';

import { app, shell } from 'electron';

import type {
  FixActionResult,
  ServiceSummary,
  StartupBackupSummary,
  StartupItem,
  TempCleanupPreview
} from '@shared/models';
import type {
  DisableStartupItemRequest,
  ExecuteTempCleanupRequest,
  KillProcessRequest,
  ListActionHistoryRequest,
  OpenProcessLocationRequest,
  RunUtilityActionRequest,
  RestoreStartupItemRequest,
  StartServiceRequest,
  StopServiceRequest,
  RestartServiceRequest
} from '@shared/ipc';
import type { DashboardService } from '@main/services/dashboardService';
import type { ActionHistoryStore } from '@main/store/actionHistoryStore';
import type { WatchdogService } from '@main/watchdog/watchdogService';
import { createStartupItemsProvider } from '@main/watchdog/startup/startupItemsProvider';

import { TempCleanupService } from './tempCleanupService';
import { createServicesProvider } from './servicesProvider';
import { createUtilityActionsProvider } from './utilityActionsProvider';

const createResult = (
  kind: FixActionResult['kind'],
  success: boolean,
  summary: string,
  details: string[]
): FixActionResult => ({
  actionId: randomUUID(),
  kind,
  success,
  timestamp: new Date().toISOString(),
  summary,
  details
});

interface FixerServiceDependencies {
  actionHistoryStore: ActionHistoryStore;
  dashboardService: DashboardService;
  watchdogService: WatchdogService;
}

const UTILITY_ACTION_COPY: Record<
  RunUtilityActionRequest['action'],
  {
    summary: string;
    details: string[];
  }
> = {
  'flush-dns': {
    summary: 'Flushed the local DNS cache',
    details: ['The local DNS resolver cache was refreshed for the current machine.']
  },
  'restart-explorer': {
    summary: 'Restarted Windows Explorer',
    details: [
      'Explorer was stopped and started again to recover the shell without rebooting the machine.'
    ]
  },
  'empty-recycle-bin': {
    summary: 'Emptied the recycle bin',
    details: [
      'Items currently in the recycle bin were removed using the standard Windows recycle-bin command.'
    ]
  },
  'restart-finder': {
    summary: 'Restarted Finder',
    details: [
      'Finder was quit and relaunched so the macOS desktop shell could recover without a full sign-out.'
    ]
  },
  'empty-trash': {
    summary: 'Emptied the Trash',
    details: ['Items currently in the Trash were removed through the standard Finder action.']
  }
};

export class FixerService {
  private readonly listeners = new Set<(result: FixActionResult) => void>();
  private readonly tempCleanupService = new TempCleanupService();
  private readonly startupItemsProvider = createStartupItemsProvider();
  private readonly servicesProvider = createServicesProvider();
  private readonly utilityActionsProvider = createUtilityActionsProvider();

  constructor(
    private readonly dependencies: FixerServiceDependencies
  ) {}

  subscribe(listener: (result: FixActionResult) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async listActionHistory(
    request: ListActionHistoryRequest = {}
  ): Promise<FixActionResult[]> {
    return this.dependencies.actionHistoryStore.list(request.limit ?? 8);
  }

  async previewTempCleanup(): Promise<TempCleanupPreview> {
    return this.tempCleanupService.preview();
  }

  async executeTempCleanup(
    request: ExecuteTempCleanupRequest
  ): Promise<FixActionResult> {
    return this.recordResult(
      await this.tempCleanupService.execute(request.previewId, request.entryIds)
    );
  }

  async killProcess(request: KillProcessRequest): Promise<FixActionResult> {
    const protectedPids = new Set([
      process.pid,
      ...app.getAppMetrics().map((metric) => metric.pid)
    ]);

    if (protectedPids.has(request.pid)) {
      return this.recordResult(
        createResult('kill-process', false, 'Refused to terminate Sovereign', [
          'The selected PID belongs to the current Sovereign app process tree.'
        ])
      );
    }

    try {
      process.kill(request.pid);
      await this.dependencies.dashboardService.refreshNow();

      return this.recordResult(
        'kill-process',
        true,
        `Sent a termination signal to ${request.name}`,
        [`PID ${request.pid} was signaled for termination.`, 'Permission or race failures are reported instead of hidden.']
      );
    } catch (error) {
      return this.recordResult(
        'kill-process',
        false,
        `Could not terminate ${request.name}`,
        [error instanceof Error ? error.message : 'Unknown process termination error.']
      );
    }
  }

  async openProcessLocation(
    request: OpenProcessLocationRequest
  ): Promise<FixActionResult> {
    try {
      await access(request.path);
      shell.showItemInFolder(request.path);

      return this.recordResult(
        'open-process-location',
        true,
        `Opened the file location for ${request.name}`,
        [
          request.path,
          request.pid ? `PID ${request.pid}` : 'Opened from watchdog event or inventory context.'
        ]
      );
    } catch (error) {
      return this.recordResult(
        'open-process-location',
        false,
        `Could not open the file location for ${request.name}`,
        [error instanceof Error ? error.message : 'Unknown file location error.']
      );
    }
  }

  async listStartupItems(): Promise<StartupItem[]> {
    if (!this.startupItemsProvider) {
      return [];
    }

    const items = await this.startupItemsProvider.list();
    return items.sort((leftItem, rightItem) => leftItem.name.localeCompare(rightItem.name));
  }

  async listStartupBackups(): Promise<StartupBackupSummary[]> {
    if (!this.startupItemsProvider) {
      return [];
    }

    return this.startupItemsProvider.listBackups(this.getStartupBackupsDirectory());
  }

  async disableStartupItem(
    request: DisableStartupItemRequest
  ): Promise<FixActionResult> {
    if (!this.startupItemsProvider) {
      return this.recordResult(
        createResult(
          'disable-startup-item',
          false,
          'Startup item control is unavailable on this platform',
          [
            'Run Sovereign on Windows or macOS to disable startup entries from this panel.'
          ]
        )
      );
    }

    try {
      const startupItems = await this.startupItemsProvider.list();
      const startupItem = startupItems.find((item) => item.id === request.startupItemId);

      if (!startupItem) {
        return this.recordResult(
          createResult('disable-startup-item', false, 'Startup item no longer exists', [
            'Refresh the startup inventory and try again.'
          ])
        );
      }

      if (!startupItem.canDisable) {
        return this.recordResult(
          'disable-startup-item',
          false,
          `Startup item cannot be disabled: ${startupItem.name}`,
          [startupItem.actionSupportReason || 'Sovereign does not support this startup source yet.']
        );
      }

      await this.startupItemsProvider.disable(
        startupItem,
        this.getStartupBackupsDirectory()
      );
      await this.dependencies.watchdogService.refreshNow();

      return this.recordResult(
        'disable-startup-item',
        true,
        `Disabled startup item: ${startupItem.name}`,
        [
          `Source: ${startupItem.location}`,
          'Sovereign stored backup metadata locally so the change can be traced and potentially reversed later.'
        ]
      );
    } catch (error) {
      return this.recordResult(
        'disable-startup-item',
        false,
        'Could not disable the selected startup item',
        [error instanceof Error ? error.message : 'Unknown startup action error.']
      );
    }
  }

  async restoreStartupItem(
    request: RestoreStartupItemRequest
  ): Promise<FixActionResult> {
    if (!this.startupItemsProvider) {
      return this.recordResult(
        createResult(
          'restore-startup-item',
          false,
          'Startup restore is unavailable on this platform',
          [
            'Run Sovereign on Windows or macOS to restore previously disabled startup entries.'
          ]
        )
      );
    }

    try {
      const restoredBackup = await this.startupItemsProvider.restore(
        request.backupId,
        this.getStartupBackupsDirectory()
      );
      await this.dependencies.watchdogService.refreshNow();

      return this.recordResult(
        'restore-startup-item',
        true,
        `Restored startup item: ${restoredBackup.name}`,
        [
          `Source: ${restoredBackup.location}`,
          'Sovereign restored the saved startup backup and removed it from the local backup inventory.'
        ]
      );
    } catch (error) {
      return this.recordResult(
        'restore-startup-item',
        false,
        'Could not restore the selected startup item',
        [error instanceof Error ? error.message : 'Unknown startup restore error.']
      );
    }
  }

  async listServices(): Promise<ServiceSummary[]> {
    if (!this.servicesProvider) {
      return [];
    }

    const services = await this.servicesProvider.list();
    return services.sort((leftService, rightService) =>
      leftService.displayName.localeCompare(rightService.displayName)
    );
  }

  async startService(
    request: StartServiceRequest
  ): Promise<FixActionResult> {
    if (!this.servicesProvider) {
      return this.recordResult(
        createResult('start-service', false, 'Service control is unavailable on this platform', [
          'Run Sovereign on Windows or macOS to control supported services from this panel.'
        ])
      );
    }

    try {
      const services = await this.servicesProvider.list();
      const service = services.find((item) => item.name === request.serviceName);

      if (!service) {
        return this.recordResult(
          createResult('start-service', false, 'Service no longer exists', [
            'Refresh the service inventory and try again.'
          ])
        );
      }

      if (!service.canStart) {
        return this.recordResult(
          'start-service',
          false,
          `Service cannot be started: ${service.displayName}`,
          [service.startSupportReason || 'The service is not currently startable from this panel.']
        );
      }

      await this.servicesProvider.startService(service.name);
      await this.dependencies.watchdogService.refreshNow();

      return this.recordResult(
        'start-service',
        true,
        `Started service: ${service.displayName}`,
        [`Service name: ${service.name}`, 'Permission failures are returned directly instead of hidden.']
      );
    } catch (error) {
      return this.recordResult(
        'start-service',
        false,
        `Could not start service: ${request.displayName}`,
        [error instanceof Error ? error.message : 'Unknown service start error.']
      );
    }
  }

  async stopService(
    request: StopServiceRequest
  ): Promise<FixActionResult> {
    if (!this.servicesProvider) {
      return this.recordResult(
        createResult('stop-service', false, 'Service control is unavailable on this platform', [
          'Run Sovereign on Windows or macOS to control supported services from this panel.'
        ])
      );
    }

    try {
      const services = await this.servicesProvider.list();
      const service = services.find((item) => item.name === request.serviceName);

      if (!service) {
        return this.recordResult(
          createResult('stop-service', false, 'Service no longer exists', [
            'Refresh the service inventory and try again.'
          ])
        );
      }

      if (!service.canStop) {
        return this.recordResult(
          'stop-service',
          false,
          `Service cannot be stopped: ${service.displayName}`,
          [service.stopSupportReason || 'The service is not currently stoppable from this panel.']
        );
      }

      await this.servicesProvider.stopService(service.name);
      await this.dependencies.watchdogService.refreshNow();

      return this.recordResult(
        'stop-service',
        true,
        `Stopped service: ${service.displayName}`,
        [`Service name: ${service.name}`, 'Permission failures are returned directly instead of hidden.']
      );
    } catch (error) {
      return this.recordResult(
        'stop-service',
        false,
        `Could not stop service: ${request.displayName}`,
        [error instanceof Error ? error.message : 'Unknown service stop error.']
      );
    }
  }

  async restartService(
    request: RestartServiceRequest
  ): Promise<FixActionResult> {
    if (!this.servicesProvider) {
      return this.recordResult(
        createResult(
          'restart-service',
          false,
          'Service control is unavailable on this platform',
          ['Run Sovereign on Windows or macOS to control supported services from this panel.']
        )
      );
    }

    try {
      const services = await this.servicesProvider.list();
      const service = services.find((item) => item.name === request.serviceName);

      if (!service) {
        return this.recordResult(
          createResult('restart-service', false, 'Service no longer exists', [
            'Refresh the service inventory and try again.'
          ])
        );
      }

      if (!service.canRestart) {
        return this.recordResult(
          'restart-service',
          false,
          `Service cannot be restarted: ${service.displayName}`,
          [
            service.restartSupportReason ||
              'The service is not currently restartable from this panel.'
          ]
        );
      }

      await this.servicesProvider.restartService(service.name);
      await this.dependencies.watchdogService.refreshNow();

      return this.recordResult(
        'restart-service',
        true,
        `Restarted service: ${service.displayName}`,
        [`Service name: ${service.name}`, 'If the OS denied the action, that failure would have been returned here instead.']
      );
    } catch (error) {
      return this.recordResult(
        'restart-service',
        false,
        `Could not restart service: ${request.displayName}`,
        [error instanceof Error ? error.message : 'Unknown service restart error.']
      );
    }
  }

  async runUtilityAction(
    request: RunUtilityActionRequest
  ): Promise<FixActionResult> {
    if (!this.utilityActionsProvider) {
      return this.recordResult(
        createResult(request.action, false, 'This utility is unavailable on this platform', [
          'Run Sovereign on Windows or macOS to use supported quick actions.'
        ])
      );
    }

    try {
      await this.utilityActionsProvider.run(request.action);
      await Promise.allSettled([
        this.dependencies.dashboardService.refreshNow(),
        this.dependencies.watchdogService.refreshNow()
      ]);

      return this.recordResult(
        createResult(
          request.action,
          true,
          UTILITY_ACTION_COPY[request.action].summary,
          UTILITY_ACTION_COPY[request.action].details
        )
      );
    } catch (error) {
      return this.recordResult(
        request.action,
        false,
        `Could not complete ${request.action}`,
        [error instanceof Error ? error.message : 'Unknown utility action error.']
      );
    }
  }

  async refreshDiagnostics(): Promise<FixActionResult> {
    const details: string[] = [];
    let success = true;

    try {
      await this.dependencies.dashboardService.refreshNow();
      details.push('Live CPU, memory, disk, network, and process telemetry refreshed.');
    } catch (error) {
      success = false;
      details.push(
        `Dashboard refresh failed: ${error instanceof Error ? error.message : 'Unknown error.'}`
      );
    }

    try {
      await this.dependencies.watchdogService.refreshNow();
      details.push(
        'Watchdog providers re-polled, including startup, scheduled tasks, and platform security status where supported.'
      );
    } catch (error) {
      success = false;
      details.push(
        `Watchdog refresh failed: ${error instanceof Error ? error.message : 'Unknown error.'}`
      );
    }

    return this.recordResult(
      createResult(
        'refresh-diagnostics',
        success,
        success ? 'Diagnostics refreshed' : 'Diagnostics refresh completed with errors',
        details
      )
    );
  }

  private async recordResult(
    resultOrKind: FixActionResult | FixActionResult['kind'],
    success?: boolean,
    summary?: string,
    details?: string[]
  ): Promise<FixActionResult> {
    const result =
      typeof resultOrKind === 'string'
        ? createResult(resultOrKind, Boolean(success), summary || '', details || [])
        : resultOrKind;

    try {
      await this.dependencies.actionHistoryStore.append(result);
    } catch (error) {
      console.warn('[fixer] failed to record action history entry', error);
    }

    this.listeners.forEach((listener) => listener(result));
    return result;
  }

  private getStartupBackupsDirectory(): string {
    return path.join(app.getPath('userData'), 'startup-backups');
  }
}
