import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseJsonArray } from '@main/watchdog/helpers';

const execFileAsync = promisify(execFile);
const POWERSHELL_EXECUTABLE = 'powershell.exe';

export const runPowerShellJson = async <Value>(command: string): Promise<Value[]> => {
  const stdout = await runPowerShellText(command);

  if (!stdout.trim()) {
    return [];
  }

  return parseJsonArray<Value>(stdout);
};

export const runPowerShellText = async (command: string): Promise<string> => {
  if (process.platform !== 'win32') {
    throw new Error('PowerShell-backed watchdog providers are only available on Windows.');
  }

  try {
    const { stdout } = await execFileAsync(
      POWERSHELL_EXECUTABLE,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 15_000,
        windowsHide: true,
        encoding: 'utf8'
      }
    );

    return stdout;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
      signal?: string;
      killed?: boolean;
    };
    const details = [
      `PowerShell command failed via ${POWERSHELL_EXECUTABLE}.`,
      execError.code ? `Code: ${execError.code}` : null,
      execError.signal ? `Signal: ${execError.signal}` : null,
      execError.killed ? 'The command timed out or was terminated.' : null,
      execError.stderr?.trim() ? `stderr: ${execError.stderr.trim()}` : null,
      execError.stdout?.trim() ? `stdout: ${execError.stdout.trim()}` : null
    ].filter(Boolean);

    throw new Error(details.join('\n'));
  }
};

export const runPowerShellObject = async <Value>(
  command: string
): Promise<Value | null> => {
  const values = await runPowerShellJson<Value>(command);
  return values[0] ?? null;
};

export const escapePowerShellString = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;
