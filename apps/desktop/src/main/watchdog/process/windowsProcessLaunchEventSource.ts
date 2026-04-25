import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import { buildKey, normalizeTimestamp } from '@main/watchdog/helpers';
import type { ProcessSnapshot } from '@main/watchdog/types';

const POWERSHELL_EXECUTABLE = 'powershell.exe';

interface RawRealtimeProcessLaunchEvent {
  ProcessId?: number;
  ParentProcessId?: number | null;
  Name?: string;
  Path?: string | null;
  CommandLine?: string | null;
  User?: string | null;
  StartedAt?: string | null;
  OccurredAt?: string | null;
}

const REALTIME_PROCESS_LAUNCH_COMMAND = `
$ErrorActionPreference = 'Stop'
$sourceId = 'SovereignProcessLaunch'
Register-WmiEvent -Class Win32_ProcessStartTrace -SourceIdentifier $sourceId | Out-Null
try {
  while ($true) {
    $event = Wait-Event -SourceIdentifier $sourceId
    if (-not $event) {
      continue
    }

    $processEvent = $event.SourceEventArgs.NewEvent
    $pid = [int]$processEvent.ProcessID
    $details = $null
    $owner = $null
    $startedAt = $null

    try {
      $details = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $pid)
      if ($details) {
        try {
          $ownerResult = Invoke-CimMethod -InputObject $details -MethodName GetOwner
          if ($ownerResult.ReturnValue -eq 0) {
            $owner = if ($ownerResult.Domain) {
              "$($ownerResult.Domain)\\$($ownerResult.User)"
            } else {
              $ownerResult.User
            }
          }
        } catch {
        }

        try {
          if ($details.CreationDate) {
            $startedAt = [System.Management.ManagementDateTimeConverter]::ToDateTime($details.CreationDate).ToUniversalTime().ToString('o')
          }
        } catch {
        }
      }
    } catch {
    }

    [PSCustomObject]@{
      ProcessId = $pid
      ParentProcessId = if ($processEvent.ParentProcessID -is [ValueType]) { [int]$processEvent.ParentProcessID } else { $null }
      Name = if ($processEvent.ProcessName) { [string]$processEvent.ProcessName } else { 'Unknown process' }
      Path = if ($details) { $details.ExecutablePath } else { $null }
      CommandLine = if ($details) { $details.CommandLine } else { $null }
      User = $owner
      StartedAt = $startedAt
      OccurredAt = $event.TimeGenerated.ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Depth 4 -Compress

    Remove-Event -EventIdentifier $event.EventIdentifier | Out-Null
  }
} finally {
  Unregister-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue
  Get-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue | Remove-Event -ErrorAction SilentlyContinue
}
`;

const toProcessSnapshot = (event: RawRealtimeProcessLaunchEvent): ProcessSnapshot => {
  const observedAt = normalizeTimestamp(event.OccurredAt);
  const startedAt = normalizeTimestamp(event.StartedAt);
  const name = event.Name?.trim() || 'Unknown process';
  const path = event.Path?.trim() || null;
  const command = event.CommandLine?.trim() || null;

  return {
    key: buildKey(event.ProcessId, startedAt || observedAt, path || command || name),
    pid: typeof event.ProcessId === 'number' ? event.ProcessId : 0,
    parentPid: typeof event.ParentProcessId === 'number' ? event.ParentProcessId : null,
    name,
    path,
    command,
    user: event.User?.trim() || null,
    startedAt,
    observedAt
  };
};

export class WindowsProcessLaunchEventSource {
  private childProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private stopRequested = false;
  private stdoutBuffer = '';
  private stderrBuffer = '';

  start(
    onEvent: (snapshot: ProcessSnapshot) => void | Promise<void>,
    onFailure: (error: Error) => void
  ): boolean {
    if (process.platform !== 'win32') {
      return false;
    }

    if (this.childProcess) {
      return true;
    }

    this.stopRequested = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    const childProcess = spawn(
      POWERSHELL_EXECUTABLE,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        REALTIME_PROCESS_LAUNCH_COMMAND
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    this.childProcess = childProcess;
    childProcess.stdout.setEncoding('utf8');
    childProcess.stderr.setEncoding('utf8');

    childProcess.stdout.on('data', (chunk: string) => {
      this.handleStdoutChunk(chunk, onEvent, onFailure);
    });

    childProcess.stderr.on('data', (chunk: string) => {
      this.stderrBuffer += chunk;
    });

    childProcess.on('error', (error) => {
      this.handleFailure(error, onFailure);
    });

    childProcess.on('exit', (code, signal) => {
      const exitedUnexpectedly = !this.stopRequested;
      this.childProcess = null;

      if (!exitedUnexpectedly) {
        return;
      }

      const details = [
        'Windows real-time process launch monitoring stopped unexpectedly.',
        code != null ? `Exit code: ${code}` : null,
        signal ? `Signal: ${signal}` : null,
        this.stderrBuffer.trim() ? `stderr: ${this.stderrBuffer.trim()}` : null
      ]
        .filter(Boolean)
        .join('\n');

      onFailure(new Error(details));
    });

    return true;
  }

  stop(): void {
    this.stopRequested = true;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    if (!this.childProcess) {
      return;
    }

    this.childProcess.kill();
    this.childProcess = null;
  }

  private handleStdoutChunk(
    chunk: string,
    onEvent: (snapshot: ProcessSnapshot) => void | Promise<void>,
    onFailure: (error: Error) => void
  ): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      try {
        const snapshot = toProcessSnapshot(
          JSON.parse(trimmedLine) as RawRealtimeProcessLaunchEvent
        );

        if (snapshot.pid <= 0) {
          continue;
        }

        void Promise.resolve(onEvent(snapshot)).catch((error) => {
          this.handleFailure(
            error instanceof Error ? error : new Error(String(error)),
            onFailure
          );
        });
      } catch (error) {
        this.handleFailure(
          error instanceof Error
            ? error
            : new Error('Could not parse a real-time process launch payload.'),
          onFailure
        );
        return;
      }
    }
  }

  private handleFailure(error: Error, onFailure: (error: Error) => void): void {
    if (!this.stopRequested) {
      this.stop();
    }

    onFailure(error);
  }
}
