import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseJsonArray } from '@main/watchdog/helpers';

const execFileAsync = promisify(execFile);

export const runPowerShellJson = async <Value>(command: string): Promise<Value[]> => {
  const stdout = await runPowerShellText(command);
  return parseJsonArray<Value>(stdout);
};

export const runPowerShellText = async (command: string): Promise<string> => {
  if (process.platform !== 'win32') {
    throw new Error('PowerShell-backed watchdog providers are only available on Windows.');
  }

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 15_000,
      windowsHide: true
    }
  );

  return stdout;
};

export const runPowerShellObject = async <Value>(
  command: string
): Promise<Value | null> => {
  const values = await runPowerShellJson<Value>(command);
  return values[0] ?? null;
};

export const escapePowerShellString = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;
