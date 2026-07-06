/**
 * @file bootstrap/steps/step-02-cache-scan.ts
 *
 * Step 02 — Cache Decision & Scanner
 *
 * This step reads the cache registry (`.kerith/bootstrap-cache.json`) and
 * decides whether to:
 * 1. Load everything from cache (full hit).
 * 2. Scan only domains that have changed (partial hit).
 * 3. Scan the entire filesystem (miss).
 *
 * It mutates the context heavily, adding the `scanResult` and `resolvedModules`
 * which are the backbone of all subsequent steps.
 */

import fs from "node:fs";
import path from "node:path";
import { CacheManager } from "../../cache/bootstrap-cache.js";
import { MtimeValidator } from "../../cache/mtime-validator.js";
import { scanFromConfig, scanModulesToResolved } from "../scanner.js";
import type { BootstrapContext } from "../context.js";
import { KERITH_VERSION } from "../version.js";

/**
 * Executes the cache and scan phase.
 * Populates `scanResult`, `resolvedModules`, and cache metadata into `ctx`.
 */
export async function runCacheAndScan(ctx: BootstrapContext): Promise<void> {
  const { config, cwd, log } = ctx;
  if (!config || !log) {
    throw new Error("runCacheAndScan requires config and log in context");
  }

  // Cache setup
  const cacheEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.KERITH_BOOTSTRAP_CACHE !== "false" &&
    ((config as any).bootstrap?.cache ?? true);

  ctx.cacheEnabled = cacheEnabled;

  let scanResult: import("../scanner.js").ScanResult | undefined;
  let usedCache = false;
  let numRescanned = 0;
  let cacheLogReason = "";
  const rescannedDomains = new Set<string>();
  let isFullCacheHit = false;

  // If no config file exists, configPath remains empty.
  // hashConfig('') returns 'no-config', which is stable between boots — no degradation.
  const configCandidates = [
    "kerith.config.ts",
    "kerith.config.js",
    "kerith.config.mjs",
  ];
  let configPath = "";
  for (const cand of configCandidates) {
    const p = path.join(cwd, cand);
    if (fs.existsSync(p)) {
      configPath = p;
      break;
    }
  }

  let configHash = "";

  if (cacheEnabled) {
    const rawCache = CacheManager.read();
    CacheManager.pending();
    configHash = CacheManager.hashConfig(configPath);

    if (rawCache !== null) {
      if (!CacheManager.valid(rawCache, KERITH_VERSION, configHash)) {
        cacheLogReason =
          rawCache.version !== KERITH_VERSION
            ? "(cache invalid — version mismatch)"
            : rawCache.cwd !== process.cwd()
              ? "(cache invalid — directory moved)"
              : "(cache invalid — config modified)";
      } else {
        // toRescan: domain IDs whose modules on disk changed (by mtime or size).
        // Domains not in toRescan will be loaded directly from rawCache.data.
        const { toRescan } = MtimeValidator.validate(rawCache, config, cwd, log);
        numRescanned = toRescan.length;

        if (numRescanned === 0) {
          // Skipped scanning entirely
          scanResult = {
            domains: rawCache.data!.domains,
            modules: rawCache.data!.modules,
            submodules: rawCache.data!.submodules,
            shared: rawCache.data!.shared,
          };
          usedCache = true;
          isFullCacheHit = true;
        } else {
          // Partial scan
          const partialScan = await scanFromConfig(
            config,
            cwd,
            (level, message, meta) => {
              log[level](message, meta);
            },
            toRescan,
          );

          for (const d of toRescan) rescannedDomains.add(d);

          // Merge logic
          const mergedDomains = rawCache
            .data!.domains.filter((d) => !rescannedDomains.has(d.name))
            .concat(partialScan.domains);

          // Handle flat modules fallback explicitly (using '__flat__')
          const cachedModules = rawCache.data!.modules.filter(
            (m) => !rescannedDomains.has(m.domain || "__flat__"),
          );
          const mergedModules = cachedModules.concat(
            partialScan.modules as any[],
          );

          const cachedSubmodules = rawCache.data!.submodules.filter(
            (s) => !rescannedDomains.has(s.domain || "__flat__"),
          );
          const mergedSubmodules = cachedSubmodules.concat(
            partialScan.submodules,
          );

          // Global @shared is always rescanned (minimal cost: one directory stat).
          // The reason: @shared does not belong to any domain, so it has no
          // domainKey that can appear in `toRescan`. Force rescan to detect
          // if src/shared/ was created or deleted between boots.
          // Domain-scoped shared is tied to domain.
          const finalSharedMap = new Map();
          for (const s of rawCache.data!.shared) {
            if (s.type === "global" || !rescannedDomains.has(s.domain!)) {
              finalSharedMap.set(s.alias, s);
            }
          }
          for (const s of partialScan.shared) {
            finalSharedMap.set(s.alias, s);
          }

          scanResult = {
            domains: mergedDomains,
            modules: mergedModules,
            submodules: mergedSubmodules,
            shared: Array.from(finalSharedMap.values()),
          };
          usedCache = true;
        }
      }
    }
  }

  // Step 2.1 — Filesystem scan (if not fully/partially cached)
  if (!scanResult) {
    scanResult = await scanFromConfig(
      config,
      cwd,
      (level, message, meta) => {
        log[level](message, meta);
      },
    );
  }

  if (scanResult.domains.length > 0) {
    log.debug(
      `Domains discovered: ${scanResult.domains.map((d) => d.name).join(", ")}`,
      { _module: "scanner", count: scanResult.domains.length },
    );
  }
  if (scanResult.shared.length > 0) {
    log.debug(
      `Shared roots discovered: ${scanResult.shared.map((s) => s.alias).join(", ")}`,
      { _module: "scanner", shared: scanResult.shared },
    );
  }

  const resolvedModules = scanModulesToResolved(scanResult);

  for (const mod of resolvedModules) {
    log.debug(`Discovered module directory: ${mod.dirPath}`, {
      dirPath: mod.dirPath,
      domain: mod.domain,
      _module: "module",
    });
  }

  ctx.scanResult = scanResult;
  ctx.resolvedModules = resolvedModules;
  ctx.usedCache = usedCache;
  ctx.numRescanned = numRescanned;
  ctx.cacheLogReason = cacheLogReason;
  ctx.rescannedDomains = rescannedDomains;
  ctx.isFullCacheHit = isFullCacheHit;
  ctx.configHash = configHash;
}
