/**
 * @file bootstrap/steps/step-09-cache-write.ts
 *
 * Step 09 — Bootstrap Cache Write
 *
 * This step executes after all modules have been resolved, validated, and
 * dynamically imported, but before `createApp()` returns. It serializes the
 * final discovered state (files, imports, exports, options) into the cache
 * registry (`.kerith/bootstrap-cache.json`) so the next run can skip the
 * filesystem scan if no files have changed.
 *
 * Cache Write Strategy
 * ────────────────────
 * The payload is built using:
 * 1. `scanResult.modules` (source of truth for parsed metadata).
 * 2. `filesByModulePath` (all source files under each module).
 * 3. `registry` (for the assigned NITS ID).
 *
 * We do not serialize the `RegisteredModule` from the registry directly, because
 * the scanner needs the raw AST options (e.g. `options.imports`) which the
 * registry discards after validation.
 */


import path from "node:path";
import { CacheManager } from "../../cache/bootstrap-cache.js";
import type { CachedModule } from "../../cache/bootstrap-cache.js";
import { getModuleSignature } from "../../cache/mtime-validator.js";
import { normalizePath } from "../../core/utils/paths.js";
import type { BootstrapContext } from "../context.js";
import { KERITH_VERSION } from "../version.js";

/**
 * Executes the cache write phase of the bootstrap pipeline.
 *
 * @param ctx - The shared bootstrap context containing the final state.
 */
export function runCacheWrite(ctx: BootstrapContext): void {
  // If cache is disabled, or we didn't perform a scan (e.g., error), do nothing.
  if (!ctx.cacheEnabled || !ctx.scanResult || !ctx.configHash) {
    return;
  }

  // Build cache data payload from scan modules (source of truth for options/imports/exports/shared)
  // combined with NITS IDs from the registry and file lists from the NITS step.
  const modulesForCache: CachedModule[] = ctx.scanResult.modules.map(
    (scanMod) => {
      // Retrieve NITS ID from registry (seeded in Step 4). Falls back to dirPath-based temp ID.
      const registeredMod = ctx.registry.getModule(
        scanMod.name,
        scanMod.domain,
      );
      const nitsId =
        registeredMod?.id ??
        `mod_${Buffer.from(scanMod.dirPath).toString("hex").slice(0, 8)}`;

      // Retrieve files from the NITS step file map
      let files: string[] = [];
      if (ctx.filesByModulePath) {
        files =
          ctx.filesByModulePath.get(
            normalizePath(path.resolve(scanMod.dirPath)),
          ) || [];
      }
      let cachedSize = (scanMod as any).cachedSize;
      let cachedMtime = (scanMod as any).cachedMtime;

      if (cachedSize === undefined || cachedMtime === undefined) {
        const signature = getModuleSignature(files);
        cachedSize = signature.totalSize;
        cachedMtime = signature.maxMtime;
      }

      return {
        // ModuleScanEntry fields
        name: scanMod.name,
        dirPath: scanMod.dirPath,
        indexPath: scanMod.indexPath,
        domain: scanMod.domain,
        imports: scanMod.imports,
        exports: scanMod.exports,
        shared: scanMod.shared,
        options: scanMod.options,
        // CachedModule-specific fields
        id: nitsId,
        files,
        identifiers: [],
        aliases: [],
        cachedSize,
        cachedMtime,
      };
    },
  );

  CacheManager.write(
    {
      domains: ctx.scanResult.domains,
      modules: modulesForCache,
      submodules: ctx.scanResult.submodules,
      shared: ctx.scanResult.shared,
      identifiers: [],
      aliases: [],
    },
    KERITH_VERSION,
    ctx.configHash,
  );
}
