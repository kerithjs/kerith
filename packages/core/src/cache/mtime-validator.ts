import fs from 'node:fs';
import path from 'node:path';
import type { BootstrapCache } from './bootstrap-cache.js';
import type { KerithConfig } from '../config/kerith-config.types.js';

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

/**
 * Detects module directories added since the cache was written.
 *
 * The per-file mtime/size pass can only ever be dirty for modules the cache
 * already knows about — it has nothing to compare a brand-new module
 * directory against, so additions are invisible to it. This mirrors the same
 * blind spot that @shared has (see step-02-cache-scan.ts), except @shared
 * gets an unconditional forced re-check every boot and modules didn't.
 *
 * Fix: group known modules by their container directory (the folder that
 * holds sibling modules, e.g. `src/modules/` or `src/{domain}/`), and do one
 * cheap `readdirSync` per container to see if a name shows up on disk that
 * the cache doesn't know about yet. This is a directory listing, not a file
 * stat/read, so it costs about the same as the @shared check already does.
 */
function detectNewModuleDirs(cache: BootstrapCache): Set<string> {
  const dirty = new Set<string>();

  const knownNamesByContainer = new Map<string, { domainKey: string; names: Set<string> }>();

  for (const module of cache.data!.modules ?? []) {
    if (!module.dirPath) continue; // defensive: malformed/partial cache entry, nothing to compare

    const domainKey = module.domain || '__flat__';
    const containerDir = path.dirname(module.dirPath);

    let entry = knownNamesByContainer.get(containerDir);
    if (!entry) {
      entry = { domainKey, names: new Set() };
      knownNamesByContainer.set(containerDir, entry);
    }
    entry.names.add(path.basename(module.dirPath));
  }

  for (const [containerDir, { domainKey, names }] of knownNamesByContainer) {
    let actualEntries: string[];
    try {
      actualEntries = fs
        .readdirSync(containerDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Container itself is gone — let the normal per-file pass / full rescan handle it.
      dirty.add(domainKey);
      continue;
    }

    if (actualEntries.some((name) => !names.has(name))) {
      dirty.add(domainKey);
    }
  }

  return dirty;
}

/**
 * Detects brand-new domain directories that have zero modules cached yet.
 *
 * detectNewModuleDirs() above only compares against containers the cache
 * already knows about — a domain that has never had a single cached module
 * has no container entry to compare against, so it's invisible to that
 * check too. This is the same blind spot @shared already gets an
 * unconditional forced re-check for; this generalizes it to domains.
 *
 * Cost: one readdirSync of `origin` root, always, regardless of dirty state.
 * Cheap relative to a real rescan — same order of magnitude as the @shared check.
 */
function detectNewDomainDirs(
  cache: BootstrapCache,
  config: KerithConfig,
  cwd: string,
): Set<string> {
  const dirty = new Set<string>();
  if (!config.origin) return dirty;

  const originPath = path.resolve(cwd, config.origin);
  const knownDomainNames = new Set(
    (cache.data!.domains ?? [])
      .filter((d) => d.dirPath)
      .map((d) => path.basename(d.dirPath)),
  );

  let actualEntries: string[];
  try {
    actualEntries = fs
      .readdirSync(originPath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    // origin itself vanished — step-01b's origin validation will surface this.
    return dirty;
  }

  for (const name of actualEntries) {
    if (!knownDomainNames.has(name)) {
      // Unknown top-level folder under origin. It may be a fresh domain
      // (with its first module) or a flat module folder container (e.g.
      // `modules/`) — either way it's new territory the per-file pass can't
      // see, so force it into the rescan set under its own name. If it turns
      // out to be a flat container, scanOrigin's normal glob still covers it
      // correctly since '__flat__' scanning is unaffected by this addition.
      dirty.add(name);
    }
  }

  return dirty;
}

/**
 * Detects new submodule directories inside already-known modules.
 *
 * Submodule files only get folded into the parent module's `files` list at
 * the moment the cache is written (see the note below). A submodule folder
 * created after that point contributes files the parent's cached list never
 * knew about, so the per-file mtime/size check has nothing to compare them
 * against — same class of blind spot as new modules and new domains.
 *
 * Cost: one readdirSync of `<module>/submodules/` per known module that has
 * such a folder. Cheap — directory listing, not file reads.
 */
function detectNewSubModuleDirs(cache: BootstrapCache): Set<string> {
  const dirty = new Set<string>();

  const knownSubModulesByParent = new Map<string, Set<string>>();
  for (const sub of cache.data!.submodules ?? []) {
    const key = `${sub.domain ?? '__flat__'}::${sub.parentModule}`;
    let names = knownSubModulesByParent.get(key);
    if (!names) {
      names = new Set();
      knownSubModulesByParent.set(key, names);
    }
    names.add(path.basename(sub.dirPath));
  }

  for (const module of cache.data!.modules ?? []) {
    if (!module.dirPath) continue; // defensive: malformed/partial cache entry
    const submodulesDir = path.join(module.dirPath, 'submodules');
    let actualEntries: string[];
    try {
      actualEntries = fs
        .readdirSync(submodulesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // No submodules/ folder (yet) — nothing to check for this module.
      continue;
    }

    if (actualEntries.length === 0) continue;

    const domainKey = module.domain || '__flat__';
    const key = `${domainKey}::${module.name}`;
    const known = knownSubModulesByParent.get(key) ?? new Set();

    if (actualEntries.some((name) => !known.has(name))) {
      dirty.add(domainKey);
    }
  }

  return dirty;
}

export const MtimeValidator = {
  validate(
    cache: BootstrapCache,
    config?: KerithConfig,
    cwd?: string,
    log?: any,
  ): MtimeValidationResult {
    const toRescanSet = new Set<string>();

    // First pass: identify all dirty domains via known-file mtime/size changes
    // (covers edits and deletions within already-known modules/submodules —
    // see getModuleSignature: a missing file returns Infinity/-1, guaranteeing
    // a mismatch and forcing a rescan of that domain).
    for (const module of cache.data!.modules ?? []) {
      const { maxMtime, totalSize } = getModuleSignature(module.files);
      const domainKey = module.domain || '__flat__';

      if (maxMtime !== module.cachedMtime || totalSize !== module.cachedSize) {
        toRescanSet.add(domainKey);
      }
    }

    // Second pass: new module directories in already-known containers.
    const newModules = detectNewModuleDirs(cache);
    if (log && newModules.size > 0) {
      log.debug(`[cache] Invalidating domains due to new module directories: ${Array.from(newModules).join(', ')}`);
    }
    for (const domainKey of newModules) {
      toRescanSet.add(domainKey);
    }

    // Third pass: brand-new domain directories (zero modules cached yet).
    if (config && cwd) {
      const newDomains = detectNewDomainDirs(cache, config, cwd);
      if (log && newDomains.size > 0) {
        log.debug(`[cache] Invalidating domains due to new domain directories: ${Array.from(newDomains).join(', ')}`);
      }
      for (const domainKey of newDomains) {
        toRescanSet.add(domainKey);
      }
    }

    // Fourth pass: new submodule directories inside known modules.
    const newSubModules = detectNewSubModuleDirs(cache);
    if (log && newSubModules.size > 0) {
      log.debug(`[cache] Invalidating domains due to new submodule directories: ${Array.from(newSubModules).join(', ')}`);
    }
    for (const domainKey of newSubModules) {
      toRescanSet.add(domainKey);
    }

    return {
      toRescan: Array.from(toRescanSet),
    };
  },
};
