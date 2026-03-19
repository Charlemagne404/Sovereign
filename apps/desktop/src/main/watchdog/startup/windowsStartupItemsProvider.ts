import path from 'node:path';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from 'node:fs/promises';

import type { StartupItemRecord } from '@main/watchdog/types';
import { buildKey } from '@main/watchdog/helpers';

import {
  escapePowerShellString,
  runPowerShellJson,
  runPowerShellText
} from '../windows/runPowerShell';

interface RawStartupItem {
  Name?: string;
  Command?: string;
  Location?: string;
  User?: string;
  SourceType?: 'registry' | 'folder';
  RegistryHive?: string;
  RegistryPath?: string;
  ValueName?: string;
  FilePath?: string;
}

interface StartupBackupRecord {
  id: string;
  name: string;
  command: string;
  location: string;
  sourceType: 'registry' | 'folder';
  registryHive: string | null;
  registryPath: string | null;
  valueName: string | null;
  filePath: string | null;
  backupPath: string | null;
  disabledAt: string;
}

const STARTUP_ITEMS_COMMAND = `
$registrySources = @(
  @{ Hive = "HKCU"; Path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"; User = $env:USERNAME },
  @{ Hive = "HKCU"; Path = "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"; User = $env:USERNAME },
  @{ Hive = "HKLM"; Path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"; User = "All users" },
  @{ Hive = "HKLM"; Path = "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"; User = "All users" },
  @{ Hive = "HKLM"; Path = "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"; User = "All users" }
)

$items = @()
foreach ($source in $registrySources) {
  $fullPath = "$($source.Hive):\\$($source.Path)"
  if (-not (Test-Path $fullPath)) {
    continue
  }

  $properties = Get-ItemProperty -Path $fullPath
  foreach ($property in $properties.PSObject.Properties) {
    if ($property.Name -in @("PSPath", "PSParentPath", "PSChildName", "PSDrive", "PSProvider")) {
      continue
    }

    $items += [PSCustomObject]@{
      Name = $property.Name
      Command = [string]$property.Value
      Location = "$($source.Hive)\\$($source.Path)"
      User = $source.User
      SourceType = "registry"
      RegistryHive = $source.Hive
      RegistryPath = $source.Path
      ValueName = $property.Name
      FilePath = $null
    }
  }
}

$startupFolders = @(
  @{ FolderPath = [Environment]::GetFolderPath("Startup"); User = $env:USERNAME; Location = "Startup folder (current user)" },
  @{ FolderPath = [Environment]::GetFolderPath("CommonStartup"); User = "All users"; Location = "Startup folder (all users)" }
)

$wsh = $null
try {
  $wsh = New-Object -ComObject WScript.Shell
} catch {
  $wsh = $null
}

foreach ($folder in $startupFolders) {
  if (-not $folder.FolderPath -or -not (Test-Path $folder.FolderPath)) {
    continue
  }

  Get-ChildItem -Path $folder.FolderPath -File | ForEach-Object {
    $command = $_.FullName
    if ($wsh -and $_.Extension -ieq ".lnk") {
      try {
        $shortcut = $wsh.CreateShortcut($_.FullName)
        if ($shortcut.TargetPath) {
          $command = "$($shortcut.TargetPath) $($shortcut.Arguments)".Trim()
        }
      } catch {
        $command = $_.FullName
      }
    }

    $items += [PSCustomObject]@{
      Name = $_.BaseName
      Command = $command
      Location = $folder.Location
      User = $folder.User
      SourceType = "folder"
      RegistryHive = $null
      RegistryPath = $null
      ValueName = $null
      FilePath = $_.FullName
    }
  }
}

$items | Sort-Object Location, Name | ConvertTo-Json -Depth 4 -Compress
`;

const REGISTRY_BACKUP_FILE = 'startup-registry-backups.json';

const getStartupId = (item: RawStartupItem): string =>
  buildKey(
    item.SourceType,
    item.RegistryHive,
    item.RegistryPath,
    item.ValueName,
    item.FilePath,
    item.Name
  );

const safeFileName = (candidate: string): string =>
  candidate.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'startup-item';

const readBackupManifest = async (
  backupsDirectory: string
): Promise<StartupBackupRecord[]> => {
  const manifestPath = path.join(backupsDirectory, REGISTRY_BACKUP_FILE);

  try {
    const rawManifest = await readFile(manifestPath, 'utf8');
    const parsedManifest = JSON.parse(rawManifest) as StartupBackupRecord[];
    return Array.isArray(parsedManifest) ? parsedManifest : [];
  } catch {
    return [];
  }
};

const writeBackupManifest = async (
  backupsDirectory: string,
  backups: StartupBackupRecord[]
): Promise<void> => {
  await mkdir(backupsDirectory, { recursive: true });
  const manifestPath = path.join(backupsDirectory, REGISTRY_BACKUP_FILE);
  await writeFile(manifestPath, JSON.stringify(backups, null, 2), 'utf8');
};

const moveFileToBackup = async (
  sourcePath: string,
  destinationPath: string
): Promise<void> => {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    if (errorCode !== 'EXDEV') {
      throw error;
    }

    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
};

export class WindowsStartupItemsProvider {
  async list(): Promise<StartupItemRecord[]> {
    const rawItems = await runPowerShellJson<RawStartupItem>(STARTUP_ITEMS_COMMAND);

    return rawItems.map((item) => ({
      id: getStartupId(item),
      name: item.Name?.trim() || 'Unnamed startup item',
      command: item.Command?.trim() || '',
      location: item.Location?.trim() || 'Unknown location',
      enabled: true,
      publisher: null,
      user: item.User?.trim() || null,
      canDisable: true,
      actionSupportReason: null,
      sourceType: item.SourceType === 'folder' ? 'folder' : 'registry',
      registryHive: item.RegistryHive?.trim() || null,
      registryPath: item.RegistryPath?.trim() || null,
      valueName: item.ValueName?.trim() || null,
      filePath: item.FilePath?.trim() || null
    }));
  }

  async disable(
    item: StartupItemRecord,
    backupsDirectory: string
  ): Promise<void> {
    if (item.sourceType === 'folder') {
      await this.disableStartupFolderItem(item, backupsDirectory);
      return;
    }

    await this.disableRegistryItem(item, backupsDirectory);
  }

  private async disableRegistryItem(
    item: StartupItemRecord,
    backupsDirectory: string
  ): Promise<void> {
    if (!item.registryHive || !item.registryPath || !item.valueName) {
      throw new Error('Registry startup item metadata is incomplete.');
    }

    const registryPath = `${item.registryHive}:\\${item.registryPath}`;
    const command = `
$path = ${escapePowerShellString(registryPath)}
$valueName = ${escapePowerShellString(item.valueName)}
if (-not (Test-Path $path)) {
  throw "Startup registry path not found."
}
Get-ItemProperty -Path $path -Name $valueName -ErrorAction Stop | Out-Null
Remove-ItemProperty -Path $path -Name $valueName -ErrorAction Stop
`;

    await runPowerShellText(command);

    const backups = await readBackupManifest(backupsDirectory);
    backups.push({
      id: item.id,
      name: item.name,
      command: item.command,
      location: item.location,
      sourceType: item.sourceType,
      registryHive: item.registryHive,
      registryPath: item.registryPath,
      valueName: item.valueName,
      filePath: item.filePath,
      backupPath: null,
      disabledAt: new Date().toISOString()
    });
    await writeBackupManifest(backupsDirectory, backups);
  }

  private async disableStartupFolderItem(
    item: StartupItemRecord,
    backupsDirectory: string
  ): Promise<void> {
    if (!item.filePath) {
      throw new Error('Startup folder item metadata is incomplete.');
    }

    const disabledDirectory = path.join(backupsDirectory, 'disabled-startup-items');
    await mkdir(disabledDirectory, { recursive: true });

    const sourceExtension = path.extname(item.filePath);
    const backupPath = path.join(
      disabledDirectory,
      `${safeFileName(item.name)}-${Date.now()}${sourceExtension}`
    );

    await moveFileToBackup(item.filePath, backupPath);

    const backups = await readBackupManifest(backupsDirectory);
    backups.push({
      id: item.id,
      name: item.name,
      command: item.command,
      location: item.location,
      sourceType: item.sourceType,
      registryHive: item.registryHive,
      registryPath: item.registryPath,
      valueName: item.valueName,
      filePath: item.filePath,
      backupPath,
      disabledAt: new Date().toISOString()
    });
    await writeBackupManifest(backupsDirectory, backups);
  }
}
