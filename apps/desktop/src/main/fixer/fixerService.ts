import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';

import { app, shell } from 'electron';

import type {
  FixActionResult,
  ProcessInfo,
  ServiceSummary,
  StartupItem,
  TempCleanupPreview
} from '@shared/models';
import type {
  DisableStartupItemRequest,
  ExecuteTempCleanupRequest,
  KillProcessRequest,
  OpenProcessLocationRequest,
  RunUtilityActionRequest,
  StartServiceRequest,
  StopServiceRequest,
  RestartServiceRequest
} from '@shared/ipc';
import type { DashboardService } from '@main/services/dashboardService';
import { WatchdogService } from '@main/watchdog/watchdogService';
import { WindowsStartupItemsProvider } from '@main/watchdog/startup/windowsStartupItemsProvider';

import { TempCleanupService } from './tempCleanupService';
import { WindowsServicesProvider } from './windows/windowsServicesProvider';
import { WindowsUtilityActionsProvider } from './windows/windowsUtilityActionsProvider';

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
  dashboardService: DashboardService;
  watchdogService: WatchdogService;
}

export class FixerService {
  private readonly tempCleanupService = new TempCleanupService();
  private readonly startupItemsProvider = new WindowsStartupItemsProvider();
  private readonly servicesProvider = new WindowsServicesProvider();
  private readonly utilityActionsProvider = new WindowsUtilityActionsProvider();

  constructor(
    private readonly dependencies: FixerServiceDependencies
  ) {}

  async previewTempCleanup(): Promise<TempCleanupPreview> {
    return this.tempCleanupService.preview();
  }

  async executeTempCleanup(
    request: ExecuteTempCleanupRequest
  ): Promise<FixActionResult> {
    return this.tempCleanupService.execute(request.previewId, request.entryIds);
  }

  async killProcess(request: KillProcessRequest): Promise<FixActionResult> {
    const protectedPids = new Set([
      process.pid,
      ...app.getAppMetrics().map((metric) => metric.pid)
    ]);

    if (protectedPids.has(request.pid)) {
      return createResult('kill-process', false, 'Refused to terminate Sovereign', [
        'The selected PID belongs to the current Sovereign app process tree.'
      ]);
    }

    try {
      process.kill(request.pid);
      await this.dependencies.dashboardService.refreshNow();

      return createResult(
        'kill-process',
        true,
        `Sent a termination signal to ${request.name}`,
        [`PID ${request.pid} was signaled for termination.`, 'Permission or race failures are reported instead of hidden.']
      );
    } catch (error) {
      return createResult(
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
    const processInfo: ProcessInfo = request.process;

    if (!processInfo.path) {
      return createResult('open-process-location', false, 'Process path unavailable', [
        `Sovereign could not determine a file path for PID ${processInfo.pid}.`
      ]);
    }

    try {
      await access(processInfo.path);
      shell.showItemInFolder(processInfo.path);

      return createResult(
        'open-process-location',
        true,
        `Opened the file location for ${processInfo.name}`,
        [processInfo.path]
      );
    } catch (error) {
      return createResult(
        'open-process-location',
        false,
        `Could not open the file location for ${processInfo.name}`,
        [error instanceof Error ? error.message : 'Unknown file location error.']
      );
    }
  }

  async listStartupItems(): Promise<StartupItem[]> {
    if (process.platform !== 'win32') {
      return [];
    }

    const items = await this.startupItemsProvider.list();
    return items.sort((leftItem, rightItem) => leftItem.name.localeCompare(rightItem.name));
  }

  async disableStartupItem(
    request: DisableStartupItemRequest
  ): Promise<FixActionResult> {
    if (process.platform !== 'win32') {
      return createResult('disable-startup-item', false, 'Startup item control is Windows-only', [
        'Run Sovereign on Windows 11 to disable startup entries from this panel.'
      ]);
    }

    try {
      const startupItems = await this.startupItemsProvider.list();
      const startupItem = startupItems.find((item) => item.id === request.startupItemId);

      if (!startupItem) {
        return createResult('disable-startup-item', false, 'Startup item no longer exists', [
          'Refresh the startup inventory and try again.'
        ]);
      }

      if (!startupItem.canDisable) {
        return createResult(
          'disable-startup-item',
          false,
          `Startup item cannot be disabled: ${startupItem.name}`,
          [startupItem.actionSupportReason || 'Sovereign does not support this startup source yet.']
        );
      }

      await this.startupItemsProvider.disable(
        startupItem,
        path.join(app.getPath('userData'), 'startup-backups')
      );
      await this.dependencies.watchdogService.refreshNow();

      return createResult(
        'disable-startup-item',
        true,
        `Disabled startup item: ${startupItem.name}`,
        [
          `Source: ${startupItem.location}`,
          'Sovereign stored backup metadata locally so the change can be traced and potentially reversed later.'
        ]
      );
    } catch (error) {
      return createResult(
        'disable-startup-item',
        false,
        'Could not disable the selected startup item',
        [error instanceof Error ? error.message : 'Unknown startup action error.']
      );
    }
  }

  async listServices(): Promise<ServiceSummary[]> {
    if (process.platform !== 'win32') {
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
    if (process.platform !== 'win32') {
      return createResult('start-service', false, 'Service control is Windows-only', [
        'Run Sovereign on Windows 11 to start services from this panel.'
      ]);
    }

    try {
      const services = await this.servicesProvider.list();
      const service = services.find((item) => item.name === request.serviceName);

      if (!service) {
        return createResult('start-service', false, 'Service no longer exists', [
          'Refresh the service inventory and try again.'
        ]);
      }

      if (!service.canStart) {
        return createResult(
          'start-service',
          false,
          `Service cannot be started: ${service.displayName}`,
          [service.startSupportReason || 'The service is not currently startable from this panel.']
        );
      }

      await this.servicesProvider.startService(service.name);
      await this.dependencies.watchdogService.refreshNow();

      return createResult(
        'start-service',
        true,
        `Started service: ${service.displayName}`,
        [`Service name: ${service.name}`, 'Windows permission failures are returned directly instead of hidden.']
      );
    } catch (error) {
      return createResult(
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
    if (process.platform !== 'win32') {
      return createResult('stop-service', false, 'Service control is Windows-only', [
        'Run Sovereign on Windows 11 to stop services from this panel.'
      ]);
    }

    try {
      const services = await this.servicesProvider.list();
      const service = services.find((item) => item.name === request.serviceName);

      if (!service) {
        return createResult('stop-service', false, 'Service no longer exists', [
          'Refresh the service inventory and try again.'
        ]);
      }

      if (!service.canStop) {
        return createResult(
          'stop-service',
          false,
          `Service cannot be stopped: ${service.displayName}`,
          [service.stopSupportReason || 'The service is not currently stoppable from this panel.']
        );
      }

      await this.servicesProvider.stopService(service.name);
      await this.dependencies.watchdogService.refreshNow();

      return createResult(
        'stop-service',
        true,
        `Stopped service: ${service.displayName}`,
        [`Service name: ${service.name}`, 'Windows permission failures are returned directly instead of hidden.']
      );
    } catch (error) {
      return createResult(
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
    if (process.platform !== 'win32') {
      return createResult('restart-service', false, 'Service control is Windows-only', [
        'Run Sovereign on Windows 11 to restart services from this panel.'
      ]);
    }

    try {
      const services = await this.servicesProvider.list();
      const service = services.find((item) => item.name === request.serviceName);

      if (!service) {
        return createResult('restart-service', false, 'Service no longer exists', [
          'Refresh the service inventory and try again.'
        ]);
      }

      if (!service.canRestart) {
        return createResult(
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

      return createResult(
        'restart-service',
        true,
        `Restarted service: ${service.displayName}`,
        [`Service name: ${service.name}`, 'If Windows required elevation and denied it, that failure would have been returned here instead.']
      );
    } catch (error) {
      return createResult(
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
    if (process.platform !== 'win32') {
      return createResult(request.action, false, 'This utility is Windows-only', [
        'Run Sovereign on Windows 11 to use this repair action.'
      ]);
    }

    const summaries: Record<RunUtilityActionRequest['action'], string> = {
      'flush-dns': 'Flushed the local DNS cache',
      'restart-explorer': 'Restarted Windows Explorer',
      'empty-recycle-bin': 'Emptied the recycle bin'
    };

    const details: Record<RunUtilityActionRequest['action'], string[]> = {
      'flush-dns': [
        'Windows cleared the local DNS resolver cache for the current machine.'
      ],
      'restart-explorer': [
        'Explorer was stopped and started again to recover the shell without rebooting the machine.'
      ],
      'empty-recycle-bin': [
        'Items currently in the recycle bin were removed using the standard Windows recycle-bin command.'
      ]
    };

    try {
      await this.utilityActionsProvider.run(request.action);
      await Promise.allSettled([
        this.dependencies.dashboardService.refreshNow(),
        this.dependencies.watchdogService.refreshNow()
      ]);

      return createResult(request.action, true, summaries[request.action], details[request.action]);
    } catch (error) {
      return createResult(
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
        'Watchdog providers re-polled, including startup, scheduled tasks, and Defender/firewall status where supported.'
      );
    } catch (error) {
      success = false;
      details.push(
        `Watchdog refresh failed: ${error instanceof Error ? error.message : 'Unknown error.'}`
      );
    }

    return createResult(
      'refresh-diagnostics',
      success,
      success ? 'Diagnostics refreshed' : 'Diagnostics refresh completed with errors',
      details
    );
  }
}
