import fs from 'node:fs';
import type { BootstrapCache } from './bootstrap-cache.js';

export interface MtimeValidationResult {
  toRescan: string[];        // domain IDs that need to be rescanned
}

export function getModuleSignature(files: string[]): { maxMtime: number; totalSize: number } {
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

    // First pass: identify all dirty domains
    // Note (PT3-2): Submodules are not iterated directly here. This is intentional.
    // The physical files of submodules are inside the parent module's directory.
    // In createApp.ts, the `filesByModulePath` grouper assigns by path prefix,
    // so submodule files are included in the parent's `module.files`.
    // A change in a submodule will correctly invalidate the parent and its domain.
    for (const module of cache.data!.modules) {
      const { maxMtime, totalSize } = getModuleSignature(module.files);
      const domainKey = module.domain || '__flat__';

      if (maxMtime !== module.cachedMtime || totalSize !== module.cachedSize) {
        toRescanSet.add(domainKey);
      }
    }

    return {
      toRescan: Array.from(toRescanSet),
    };
  },
};
