import { runPowerShellText } from '@main/watchdog/windows/runPowerShell';

export type WindowsUtilityAction =
  | 'flush-dns'
  | 'restart-explorer'
  | 'empty-recycle-bin';

export class WindowsUtilityActionsProvider {
  async run(action: WindowsUtilityAction): Promise<void> {
    if (action === 'flush-dns') {
      await runPowerShellText('Clear-DnsClientCache -ErrorAction Stop');
      return;
    }

    if (action === 'restart-explorer') {
      await runPowerShellText(
        '$explorer = Get-Process explorer -ErrorAction SilentlyContinue; if ($explorer) { Stop-Process -Name explorer -Force -ErrorAction Stop }; Start-Process explorer.exe'
      );
      return;
    }

    await runPowerShellText('Clear-RecycleBin -Force -ErrorAction Stop');
  }
}
