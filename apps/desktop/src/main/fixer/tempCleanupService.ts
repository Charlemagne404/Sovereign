import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  readdir,
  rm
} from 'node:fs/promises';

import type {
  FixActionResult,
  TempCleanupEntry,
  TempCleanupPreview
} from '@shared/models';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface CachedPreview {
  createdAt: number;
  entries: Map<string, TempCleanupEntry>;
}

const sortLargestFirst = (left: TempCleanupEntry, right: TempCleanupEntry): number =>
  right.sizeBytes - left.sizeBytes;

export class TempCleanupService {
  private readonly previewCache = new Map<string, CachedPreview>();

  async preview(): Promise<TempCleanupPreview> {
    this.expirePreviews();

    const roots = [...new Set([path.resolve(os.tmpdir())])];
    const entries: TempCleanupEntry[] = [];
    const rootSummaries = new Map<string, TempCleanupPreview['rootSummaries'][number]>();
    let skippedRecentCount = 0;
    let skippedErrorCount = 0;
    let skippedSymlinkCount = 0;

    for (const root of roots) {
      rootSummaries.set(root, {
        root,
        itemCount: 0,
        totalBytes: 0,
        fileCount: 0,
        directoryCount: 0
      });

      try {
        const dirents = await readdir(root, { withFileTypes: true });

        for (const dirent of dirents) {
          const candidatePath = path.join(root, dirent.name);

          try {
            const stats = await lstat(candidatePath);

            if (stats.isSymbolicLink()) {
              skippedSymlinkCount += 1;
              continue;
            }

            if (Date.now() - stats.mtimeMs < STALE_THRESHOLD_MS) {
              skippedRecentCount += 1;
              continue;
            }

            const entry: TempCleanupEntry = {
              id: randomUUID(),
              name: dirent.name,
              path: candidatePath,
              root,
              sizeBytes: await this.getEntrySize(candidatePath),
              modifiedAt: new Date(stats.mtimeMs).toISOString(),
              isDirectory: stats.isDirectory()
            };

            entries.push(entry);
            const rootSummary = rootSummaries.get(root);

            if (rootSummary) {
              rootSummary.itemCount += 1;
              rootSummary.totalBytes += entry.sizeBytes;
              if (entry.isDirectory) {
                rootSummary.directoryCount += 1;
              } else {
                rootSummary.fileCount += 1;
              }
            }
          } catch {
            skippedErrorCount += 1;
          }
        }
      } catch {
        skippedErrorCount += 1;
      }
    }

    const sortedEntries = entries.sort(sortLargestFirst);
    const fileCount = sortedEntries.filter((entry) => !entry.isDirectory).length;
    const directoryCount = sortedEntries.length - fileCount;
    const previewId = randomUUID();
    this.previewCache.set(previewId, {
      createdAt: Date.now(),
      entries: new Map(sortedEntries.map((entry) => [entry.id, entry]))
    });

    return {
      previewId,
      generatedAt: new Date().toISOString(),
      roots,
      rootSummaries: [...rootSummaries.values()],
      entries: sortedEntries,
      totalBytes: sortedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      itemCount: sortedEntries.length,
      fileCount,
      directoryCount,
      oldestModifiedAt:
        [...sortedEntries]
          .sort((left, right) => Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt))[0]
          ?.modifiedAt || null,
      largestEntry: sortedEntries[0] || null,
      skippedRecentCount,
      skippedErrorCount,
      skippedSymlinkCount,
      notes: [
        'Only top-level items inside the current user temp root are included.',
        'Only items older than 24 hours are eligible for cleanup.',
        'Locked or permission-protected items will be reported instead of silently ignored.',
        skippedSymlinkCount > 0
          ? `${skippedSymlinkCount} symbolic link${skippedSymlinkCount === 1 ? ' was' : 's were'} skipped to avoid deleting through indirect paths.`
          : 'Symbolic links are skipped to avoid deleting through indirect paths.'
      ]
    };
  }

  async execute(previewId: string, entryIds?: string[]): Promise<FixActionResult> {
    this.expirePreviews();

    const preview = this.previewCache.get(previewId);
    if (!preview) {
      return {
        actionId: randomUUID(),
        kind: 'temp-cleanup',
        success: false,
        timestamp: new Date().toISOString(),
        summary: 'Temp cleanup preview expired',
        details: [
          'Generate a fresh preview before running cleanup so Sovereign only deletes explicitly reviewed entries.'
        ]
      };
    }

    const selectedEntries = (entryIds?.length ? entryIds : [...preview.entries.keys()])
      .map((entryId) => preview.entries.get(entryId))
      .filter((entry): entry is TempCleanupEntry => Boolean(entry));

    if (selectedEntries.length === 0) {
      this.previewCache.delete(previewId);
      return {
        actionId: randomUUID(),
        kind: 'temp-cleanup',
        success: true,
        timestamp: new Date().toISOString(),
        summary: 'No eligible temp items were selected',
        details: ['Nothing was removed. Generate another preview if you want to review candidates again.']
      };
    }

    let removedCount = 0;
    let failedCount = 0;
    let removedBytes = 0;
    const details: string[] = [];

    for (const entry of selectedEntries) {
      try {
        await rm(entry.path, { recursive: true, force: false, maxRetries: 1 });
        removedCount += 1;
        removedBytes += entry.sizeBytes;
      } catch (error) {
        failedCount += 1;
        details.push(
          `${entry.name}: ${error instanceof Error ? error.message : 'Unknown cleanup error.'}`
        );
      }
    }

    this.previewCache.delete(previewId);

    return {
      actionId: randomUUID(),
      kind: 'temp-cleanup',
      success: failedCount === 0,
      timestamp: new Date().toISOString(),
      summary:
        failedCount === 0
          ? `Removed ${removedCount} temp item${removedCount === 1 ? '' : 's'}`
          : `Removed ${removedCount} temp item${removedCount === 1 ? '' : 's'} with ${failedCount} failure${failedCount === 1 ? '' : 's'}`,
      details: [
        `Eligible items removed: ${removedCount}`,
        `Estimated space reclaimed: ${removedBytes} bytes`,
        ...(details.length > 0 ? details : ['Cleanup completed without permission or lock errors.'])
      ]
    };
  }

  private expirePreviews(): void {
    const now = Date.now();

    for (const [previewId, preview] of this.previewCache.entries()) {
      if (now - preview.createdAt > PREVIEW_TTL_MS) {
        this.previewCache.delete(previewId);
      }
    }
  }

  private async getEntrySize(candidatePath: string): Promise<number> {
    const stats = await lstat(candidatePath);

    if (!stats.isDirectory()) {
      return stats.size;
    }

    const children = await readdir(candidatePath, { withFileTypes: true });
    let totalSize = 0;

    for (const child of children) {
      const childPath = path.join(candidatePath, child.name);

      try {
        const childStats = await lstat(childPath);
        if (childStats.isSymbolicLink()) {
          continue;
        }

        totalSize += childStats.isDirectory()
          ? await this.getEntrySize(childPath)
          : childStats.size;
      } catch {
        continue;
      }
    }

    return totalSize;
  }
}
