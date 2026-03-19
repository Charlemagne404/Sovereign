import type { ServiceSummary } from '@shared/models';

import {
  escapePowerShellString,
  runPowerShellJson,
  runPowerShellText
} from '@main/watchdog/windows/runPowerShell';

interface RawServiceSummary {
  Name?: string;
  DisplayName?: string;
  State?: string;
  StartMode?: string;
}

const SERVICES_COMMAND = `
$services = Get-CimInstance Win32_Service |
  Sort-Object DisplayName |
  ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      DisplayName = $_.DisplayName
      State = $_.State
      StartMode = $_.StartMode
    }
  }
$services | ConvertTo-Json -Depth 3 -Compress
`;

const mapServiceState = (
  state: string | undefined
): ServiceSummary['state'] => {
  if (!state) {
    return 'unknown';
  }

  const normalizedState = state.toLowerCase();
  if (normalizedState === 'running') {
    return 'running';
  }

  if (normalizedState === 'stopped') {
    return 'stopped';
  }

  if (normalizedState === 'paused') {
    return 'paused';
  }

  return 'unknown';
};

const mapStartMode = (
  startMode: string | undefined
): ServiceSummary['startMode'] => {
  if (!startMode) {
    return 'unknown';
  }

  const normalizedStartMode = startMode.toLowerCase();
  if (normalizedStartMode === 'auto') {
    return 'automatic';
  }

  if (normalizedStartMode === 'manual') {
    return 'manual';
  }

  if (normalizedStartMode === 'disabled') {
    return 'disabled';
  }

  return 'unknown';
};

export class WindowsServicesProvider {
  async list(): Promise<ServiceSummary[]> {
    const rawServices = await runPowerShellJson<RawServiceSummary>(SERVICES_COMMAND);

    return rawServices.map((service) => {
      const state = mapServiceState(service.State);
      const startMode = mapStartMode(service.StartMode);
      const canRestart = state === 'running' && startMode !== 'disabled';

      return {
        name: service.Name?.trim() || 'unknown-service',
        displayName: service.DisplayName?.trim() || service.Name?.trim() || 'Unnamed service',
        state,
        startMode,
        canRestart,
        actionSupportReason: canRestart
          ? null
          : state !== 'running'
            ? 'Only running services can be restarted from this panel.'
            : 'Disabled services cannot be restarted until Windows allows them to start.'
      };
    });
  }

  async restartService(serviceName: string): Promise<void> {
    await runPowerShellText(
      `Restart-Service -Name ${escapePowerShellString(serviceName)} -ErrorAction Stop`
    );
  }
}
