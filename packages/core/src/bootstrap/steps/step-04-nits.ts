/**
 * @file bootstrap/steps/step-04-nits.ts
 *
 * Step 04 — NITS Identity Reconciliation
 *
 * This step manages the NITS (Native Identity Tracking System) lifecycle:
 * 1. Read/create `.kerith` shadow files for all discovered modules.
 * 2. Hash module contents and identifiers.
 * 3. Load the previous NITS registry (`.kerith/registry.json`).
 * 4. Reconcile identities (assigning stable IDs to modules even if renamed/moved).
 * 5. Update the NITS registry and write missing shadow files.
 * 6. Seed the main Kerith registry with the reconciled IDs.
 *
 * If NITS is disabled in config, or if it fails, the pipeline continues
 * gracefully using temporary hash-based IDs.
 */

import path from "node:path";
import {
  loadNitsRegistry,
  saveNitsRegistry,
  initNitsRegistry,
  inferProjectName,
  scanShadowFiles,
  postReconcileEnsureShadowFiles,
} from "../../nits/nits-store.js";
import {
  reconcile,
  buildUpdatedNitsRegistryFromRecords,
  buildNitsIdMap,
} from "../../nits/nits-reconciler.js";
import { reportReconciliation } from "../../nits/nits-reporter.js";
import { computeModuleHash } from "../../nits/nits-hash.js";
import {
  normalizePath,
  groupFilesByModulePath,
} from "../../core/utils/paths.js";
import {
  loadDomainRegistry,
  saveDomainRegistry,
  migrateLegacyDomainModules,
} from "../../nits/domain-store.js";
import type { DiscoveredModule, NitsModuleRecord } from "../../types/nits.js";
import type { BootstrapContext } from "../context.js";

/**
 * Executes the NITS identity reconciliation phase.
 *
 * @param ctx - The shared bootstrap context.
 */
export async function runNitsReconciliation(
  ctx: BootstrapContext,
): Promise<void> {
  const {
    config,
    log,
    registry,
    resolvedModules,
    cwd,
    allProjectFiles,
    absoluteModulesRoot,
  } = ctx;

  if (
    !config ||
    !log ||
    !resolvedModules ||
    !allProjectFiles ||
    absoluteModulesRoot === undefined
  ) {
    throw new Error(
      "runNitsReconciliation requires config, log, resolvedModules, allProjectFiles, and absoluteModulesRoot in context",
    );
  }

  let filesByModulePath: Map<string, string[]> | undefined;

  if (config.nits?.enabled !== false) {
    try {
      // Step 4.1 — Read/create shadow files for all discovered modules.
      const shadowFileMap = scanShadowFiles(resolvedModules);

      // Un solo glob global para todos los archivos (filtrado en memoria)
      const allNitsFiles = absoluteModulesRoot
        ? allProjectFiles.filter((f) => {
            const base = path.basename(f);
            return !base.startsWith("index.") && !f.endsWith(".cjs");
          })
        : undefined;

      // Agrupar por módulo usando el dirPath como prefijo (ordenados por longitud desc)
      if (allNitsFiles) {
        const modPaths = resolvedModules.map((mod) =>
          path.resolve(mod.dirPath),
        );
        filesByModulePath = groupFilesByModulePath(allNitsFiles, modPaths);
      }

      // Parallellize hashing and loading the previous registry
      const [discovered, loadedRegistry] = await Promise.all([
        Promise.all(
          resolvedModules.map(async (mod) => {
            const modFiles = filesByModulePath
              ? filesByModulePath.get(normalizePath(path.resolve(mod.dirPath)))
              : undefined;
            const { hash, identifiers } = await computeModuleHash(
              mod.dirPath,
              modFiles,
            );
            return {
              name: mod.name,
              dirPath: mod.dirPath,
              domain: mod.domain,
              identifiers,
              hash,
              shadowFile: shadowFileMap.get(mod.dirPath),
            };
          }),
        ),
        loadNitsRegistry(cwd),
      ]);

      const oldRegistry =
        loadedRegistry || initNitsRegistry(inferProjectName(cwd));

      // Layer 1 Filter: Purge compilation artifacts (e.g. dist/) from registry
      let modulesRoots: string[] = [];
      if (config.origin) {
        modulesRoots = [normalizePath(path.resolve(cwd, config.origin))];
      } else if (config.modules) {
        const rawGlobs = Array.isArray(config.modules)
          ? config.modules
          : typeof config.modules === "string" &&
              config.modules.startsWith("{") &&
              config.modules.endsWith("}")
            ? config.modules.slice(1, -1).split(",")
            : [config.modules];
        modulesRoots = rawGlobs.map((g) =>
          normalizePath(path.resolve(cwd, g.split("*")[0])),
        );
      }

      for (const [id, mod] of Object.entries(oldRegistry.modules)) {
        const absPath = normalizePath(path.resolve(cwd, mod.path));
        const isWithinRoots = modulesRoots.some((root) =>
          absPath.startsWith(root),
        );
        if (!isWithinRoots) {
          log.warn(`[NITS] Purging artifact from registry: ${mod.path}`, {
            _module: "nits",
          });
          delete oldRegistry.modules[id];
        }
      }

      const nitsResult = reconcile(
        discovered as DiscoveredModule[],
        oldRegistry,
        cwd,
        {
          similarityThreshold: config.nits?.similarityThreshold,
          stalePurgeCycles: config.rules?.stalePurgeCycles,
          log,
        },
      );

      reportReconciliation(nitsResult, log);

      // ← Partición por dominio dueño, antes de construir el registry global.
      // nits-reconciler.ts NO se modifica: esto solo agrupa el resultado ya
      // calculado por record.domain.
      const allActiveForPartition = [
        ...nitsResult.confirmed,
        ...nitsResult.moved.map((m) => m.record),
        ...nitsResult.candidates.map((m) => m.record),
        ...nitsResult.newModules,
        ...nitsResult.stale,
      ];

      const byDomain = new Map<string, typeof allActiveForPartition>();
      const flatModules: typeof allActiveForPartition = [];

      for (const record of allActiveForPartition) {
        if (record.domain) {
          const bucket = byDomain.get(record.domain) ?? [];
          bucket.push(record);
          byDomain.set(record.domain, bucket);
        } else {
          flatModules.push(record);
        }
      }

      // 5.8 — Migración hacia atrás (backward migration)
      // Done BEFORE the regular domain write to guarantee safe transfer
      for (const domainName of byDomain.keys()) {
        const domainEntry = registry.getDomain(domainName);
        if (domainEntry) {
          const legacyModules: Record<string, NitsModuleRecord> = {};
          for (const [id, mod] of Object.entries(oldRegistry.modules)) {
            if (mod.domain === domainName) {
              legacyModules[id] = mod;
            }
          }
          if (Object.keys(legacyModules).length > 0) {
            await migrateLegacyDomainModules(
              domainEntry.path,
              domainName,
              legacyModules,
            );
          }
        }
      }

      for (const [domainName, records] of byDomain) {
        const domainEntry = registry.getDomain(domainName);
        if (!domainEntry) {
          log.warn(
            `[NITS] Module(s) reference domain "${domainName}" but it is not registered. Skipping domain registry write.`,
            {
              _module: "nits",
            },
          );
          continue;
        }

        const existingDomainRegistry = await loadDomainRegistry(
          domainEntry.path,
        );
        const modulesRecord: Record<string, NitsModuleRecord> = {};
        for (const record of records) {
          const { resolvedBy: _drop, ...persisted } = record;
          modulesRecord[record.id] = persisted as NitsModuleRecord;
        }

        await saveDomainRegistry(domainEntry.path, {
          version: existingDomainRegistry?.version ?? "1.0.0",
          domain: existingDomainRegistry?.domain ?? {
            id: "",
            name: domainName,
            registeredAt: new Date().toISOString(),
          },
          modules: modulesRecord,
          submodules: existingDomainRegistry?.submodules ?? [],
          shared: existingDomainRegistry?.shared,
          lastCheck: new Date().toISOString(),
        });
      }

      // The global registry only ever receives flat (domain-less) records from here on.
      const updatedNits = buildUpdatedNitsRegistryFromRecords(
        flatModules,
        oldRegistry.project,
      );

      const domainsIndex: Record<
        string,
        { id: string; name: string; path: string }
      > = {};
      for (const domain of registry.getAllDomains()) {
        if (domain.id) {
          domainsIndex[domain.id] = {
            id: domain.id,
            name: domain.name,
            path: domain.path,
          };
        }
      }
      updatedNits.domains = domainsIndex;

      await saveNitsRegistry(updatedNits, cwd);

      // Step 4.2 — Write shadow files for modules resolved by path/Jaccard (migration path).
      const resolvedDirs = new Map<string, string>(
        resolvedModules.map((m) => [m.dirPath, m.name]),
      );
      postReconcileEnsureShadowFiles(nitsResult, resolvedDirs, modulesRoots);

      // Seed the registry with the reconciled IDs
      const nitsIdMap = buildNitsIdMap(nitsResult, cwd);
      registry.seedNitsIds(nitsIdMap);

      log.debug("NITS identity reconciliation complete.", {
        _module: "nits",
      });
    } catch (err: any) {
      log.warn(
        `NITS reconciliation failed: ${err.message}. Bootstrap will continue with temporary identities.`,
        { _module: "nits" },
      );
      log.debug("NITS Error detail:", { error: err, _module: "nits" });
    }
  }

  // Mutate context
  ctx.filesByModulePath = filesByModulePath;
}
