import fs from 'node:fs';
import type { BootstrapCache, CachedModule } from './bootstrap-cache.js';

export interface MtimeValidationResult {
  toRescan: string[];        // domain IDs that need to be rescanned
  fromCache: CachedModule[]; // modules that can be loaded directly from cache
}

function getModuleSignature(files: string[]): { maxMtime: number; totalSize: number } {
  let maxMtime = 0;
  let totalSize = 0;

  for (const file of files) {
    try {
      const stats = fs.statSync(file);
      if (stats.mtimeMs > maxMtime) {
        maxMtime = stats.mtimeMs;
      }
      totalSize += stats.size;
    } catch (e) {
      // If a file does not exist or cannot be accessed, mark as dirty immediately
      return { maxMtime: Infinity, totalSize: -1 };
    }
  }

  return { maxMtime, totalSize };
}

export const MtimeValidator = {
  validate(cache: BootstrapCache): MtimeValidationResult {
    const toRescanSet = new Set<string>();
    const fromCache: CachedModule[] = [];

    // Fallback to 0 if savedAt is somehow missing, forcing a full rescan
    const savedAtTime = cache.savedAt ? new Date(cache.savedAt).getTime() : 0;

    // First pass: identify all dirty domains
    for (const module of cache.data!.modules) {
      const { maxMtime, totalSize } = getModuleSignature(module.files);
      const domainKey = module.domain || '__flat__';

      if (maxMtime > savedAtTime || totalSize !== module.cachedSize) {
        toRescanSet.add(domainKey);
      }
    }

    // Second pass: modules whose domains are not dirty go to fromCache
    for (const module of cache.data!.modules) {
      const domainKey = module.domain || '__flat__';
      if (!toRescanSet.has(domainKey)) {
        fromCache.push(module);
      }
    }

    return {
      toRescan: Array.from(toRescanSet),
      fromCache,
    };
  },
};
