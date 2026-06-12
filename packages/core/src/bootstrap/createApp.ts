import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";
import type { Application } from "express";
import type { CreateAppOptions, KerithApp } from "../types/index.js";

import { loadConfig } from "../core/config.js";
import { KerithError } from "../core/errors.js";
import { createRegistry, registryContext, buildModuleKey } from "../core/registry.js";
import { activateAliasResolver } from "../aliases/resolver.js";
import { updateAliasCache } from "../aliases/cache.js";
import {
  writeTsconfigKerith,
  ensureTsconfigExtends,
} from "../config/tsconfig-generator.js";
import { createLogger, defaultLogHandler } from "../core/logger.js";
import {
  setPinoInstance,
  createDefaultPinoInstance,
} from "../core/pino-instance.js";
import { performance } from "node:perf_hooks";
import pc from "picocolors";
import { extractModuleImports } from "../nits/import-scanner.js";
import {
  loadNitsRegistry,
  saveNitsRegistry,
  initNitsRegistry,
  inferProjectName,
  scanShadowFiles,
  postReconcileEnsureShadowFiles,
} from "../nits/nits-store.js";
import {
  reconcile,
  buildUpdatedNitsRegistry,
  buildNitsIdMap,
} from "../nits/nits-reconciler.js";
import { reportReconciliation } from "../nits/nits-reporter.js";
import { computeModuleHash } from "../nits/nits-hash.js";
import { normalizePath } from "../core/utils/paths.js";
import { registerShutdown } from "../core/shutdown.js";
import type { DiscoveredModule } from "../types/nits.js";
import {
  scanFromConfig,
  scanModulesToResolved,
} from "./scanner.js";
import { registerEntitiesFromScan } from "./register-from-scan.js";
import { importIndexEntry } from "./import-index.js";
import { CacheManager } from "../cache/bootstrap-cache.js";
import type { CachedModule } from "../cache/bootstrap-cache.js";
import { MtimeValidator } from "../cache/mtime-validator.js";

// Helper for extracting version from package.json
const getKerithVersion = () => {
  const depths = [
    "../package.json",
    "../../package.json",
    "../../../package.json",
  ];
  for (const d of depths) {
    try {
      const p = new URL(d, import.meta.url);
      return JSON.parse(fs.readFileSync(p, "utf8")).version;
    } catch (_e) {
      /* not a valid package.json path, try next */
    }
  }
  return 'unknown';
};

export const KERITH_VERSION = getKerithVersion();

export async function createApp(
  app?: Application,
  options: CreateAppOptions = {},
): Promise<KerithApp> {
  // Step 0 — Prevent Duplicate Bootstrap
  if (app && (app as any).__KerithBootstrapped) {
    throw new KerithError(
      "DUPLICATE_BOOTSTRAP",
      "createApp() was called more than once with the same Express instance.",
    );
  }

  // Step 0.5 — ESM Environment Validation
  let isEsm = false;
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.type === "module") {
        isEsm = true;
      }
    }
  } catch (_e) {
    // Failsafe
  }

  if (!isEsm) {
    throw new KerithError(
      "INVALID_ESM_ENV",
      'Kerith requires an ESM environment. Please ensure "type": "module" is present in your root package.json file.',
    );
  }

  const registry = createRegistry();

  return registryContext.run(registry, async () => {
    const startTime = performance.now();
    let cacheEnabled = false; // hoisted so catch{} can call CacheManager.fail() when needed
    try {
      // Step 0.1 — Pre-loader Validation
      const preloadConfig = globalThis.__KERITH_PRELOAD_CONFIG__;
      const preloaderActive = preloadConfig?.preloaded === true;

      // Step 1 — Load configuration
      const config = await loadConfig(options);

      if (config.requirePreloader === true && !preloaderActive) {
        throw new KerithError(
          "PRELOADER_REQUIRED",
          "The application requires the Kerith pre-loader to be active.",
          'Run the application with "node --import ./.kerith/preload.js" or set requirePreloader: false in kerith.config.ts.',
        );
      }
      if (config.logger === defaultLogHandler) {
        setPinoInstance(
          createDefaultPinoInstance(config.logFormat, config.logLevel),
        );
      }
      const log = createLogger(config.logger, config.logLevel, "boot");

      // Step 1.0.5 — Generar tsconfig.kerith.json y registrar aliases
      await writeTsconfigKerith(config, process.cwd(), log);
      await ensureTsconfigExtends(process.cwd(), log);
      log.debug(
        `[bootstrap] Aliases registrados: ${[...config.resolvedAliases.keys()].join(", ")}`,
        { _module: "alias" },
      );

      // Step 1.1 — Pre-loader Warnings
      if (!preloaderActive && config.resolveAliases !== false) {
        log.warn(
          "Pre-loader not detected. Alias resolution might fail for top-level imports. Running in legacy mode (v1.4.0).",
          {
            suggestion:
              'Run "npx kerith sync-preload" and use "node --import ./.kerith/preload.js"',
          },
        );
      }

      if (preloaderActive) {
        if (
          preloadConfig?._version &&
          preloadConfig._version !== KERITH_VERSION
        ) {
          log.warn(
            `Pre-loader version mismatch: preload.js was generated with v${preloadConfig._version} but Kerith-core v${KERITH_VERSION} is installed. Run: kerith sync-preload`,
          );
        }
      }

      const cwd = process.cwd();

      // Step 1 — Resolve and validate origin path
      if (config.origin) {
        const originAbsolutePath = path.resolve(cwd, config.origin);
        if (!fs.existsSync(originAbsolutePath)) {
          throw new KerithError(
            "ORIGIN_NOT_FOUND",
            `origin '${config.origin}' not found. Set origin in kerith.config.js`,
          );
        }
      }

      log.info("Bootstrap started", {
        origin: config.origin ?? "(none)",
        modules: config.modules,
        prefix: config.prefix || "(none)",
        strict: config.strict,
        nodeVersion: process.version,
      });

      // Cache setup
      cacheEnabled = process.env.NODE_ENV !== 'production' &&
                     process.env.KERITH_BOOTSTRAP_CACHE !== 'false' &&
                     ((config as any).bootstrap?.cache ?? true);

      let scanResult: import("./scanner.js").ScanResult | undefined;
      let usedCache = false;
      let numRescanned = 0;
      let cacheLogReason = '';

      const configCandidates = ['kerith.config.ts', 'kerith.config.js', 'kerith.config.mjs'];
      let configPath = '';
      for (const cand of configCandidates) {
        const p = path.join(cwd, cand);
        if (fs.existsSync(p)) { configPath = p; break; }
      }

      let configHash = '';

      if (cacheEnabled) {
        CacheManager.pending();
        const rawCache = CacheManager.read();
        configHash = CacheManager.hashConfig(configPath);

        if (rawCache !== null) {
          if (!CacheManager.valid(rawCache, KERITH_VERSION, configHash)) {
            cacheLogReason = rawCache.version !== KERITH_VERSION 
              ? '(cache inválido — versión mismatch)' 
              : '(cache inválido — config modificado)';
          } else {
            const { toRescan, fromCache } = MtimeValidator.validate(rawCache);
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
            } else {
              // Partial scan
              const partialScan = await scanFromConfig(config, cwd, (level, message, meta) => {
                log[level](message, meta);
              }, toRescan);

              const rescannedDomains = new Set(toRescan);

              // Merge logic
              const mergedDomains = rawCache.data!.domains.filter(d => !rescannedDomains.has(d.name)).concat(partialScan.domains);
              
              // Handle flat modules fallback explicitly (using '__flat__')
              const cachedModules = rawCache.data!.modules.filter(m => !rescannedDomains.has(m.domain || '__flat__'));
              const mergedModules = cachedModules.concat(partialScan.modules as any[]);

              const cachedSubmodules = rawCache.data!.submodules.filter(s => !rescannedDomains.has(s.domain || '__flat__'));
              const mergedSubmodules = cachedSubmodules.concat(partialScan.submodules);

              // Global shared is rescanned every time if it exists, domain-scoped is tied to domain
              const finalSharedMap = new Map();
              for (const s of rawCache.data!.shared) {
                if (s.type === 'global' || !rescannedDomains.has(s.domain!)) {
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

      // Step 2 — Filesystem scan (if not fully/partially cached)
      if (!scanResult) {
        scanResult = await scanFromConfig(config, cwd, (level, message, meta) => {
          log[level](message, meta);
        });
      }
      
      const isOriginMode = !!config.origin;

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

      // Step 3 — Register scan entities (domains → shared → submodules)
      registerEntitiesFromScan(registry, scanResult, (level, message, meta) => {
        log[level](message, meta);
      });
      log.debug("Scan entities seeded in registry", {
        domains: scanResult.domains.length,
        shared: scanResult.shared.length,
        submodules: scanResult.submodules.length,
        modules: resolvedModules.length,
        _module: "bootstrap",
      });

      // Pre-fetch all project files to avoid multiple glob calls later
      let modulesRoot = "";
      if (config.origin) {
        modulesRoot = config.origin;
      } else if (config.modules) {
        modulesRoot = config.modules.split("*")[0].replace(/\/$/, "");
      }
      const absoluteModulesRoot = modulesRoot ? normalizePath(path.resolve(cwd, modulesRoot)) : "";

      let allProjectFiles: string[] = [];
      if (absoluteModulesRoot) {
        allProjectFiles = await fg(`${absoluteModulesRoot}/**/*.{ts,js,mts,mjs,cjs}`, {
          absolute: true,
          cwd,
          ignore: [
            "**/*.test.*",
            "**/*.spec.*",
            "**/*.d.ts",
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**"
          ],
        });
      }

      let filesByModulePath: Map<string, string[]> | undefined;

      // Step 4 — NITS identity reconciliation
      if (config.nits?.enabled !== false) {
        try {
          // Step 2.5a — Read/create shadow files for all discovered modules.
          // scanShadowFiles calls ensureShadowFile per module:
          //   - First boot: writes a new .kerith file with a fresh mod_{hex} ID.
          //   - Subsequent boots: reads the existing file (no-op if already valid).
          // Errors are swallowed inside shadow-file.ts — bootstrap never fails here.
          const shadowFileMap = scanShadowFiles(resolvedModules);

          // Un solo glob global para todos los archivos (filtrado en memoria)
          const allNitsFiles = absoluteModulesRoot
            ? allProjectFiles.filter((f) => {
                const base = path.basename(f);
                return !base.startsWith('index.') && !f.endsWith('.cjs');
              })
            : undefined;

          // Agrupar por módulo usando el dirPath como prefijo
          if (allNitsFiles) {
            filesByModulePath = new Map<string, string[]>();
            for (const mod of resolvedModules) {
              filesByModulePath.set(normalizePath(path.resolve(mod.dirPath)), []);
            }
            for (const file of allNitsFiles) {
              const normalizedFile = normalizePath(file);
              for (const [modPath, files] of filesByModulePath) {
                if (normalizedFile.startsWith(modPath + '/')) {
                  files.push(file);
                  break;
                }
              }
            }
          }

          const discovered: DiscoveredModule[] = await Promise.all(
            resolvedModules.map(async (mod) => {
              const modFiles = filesByModulePath
                ? filesByModulePath.get(normalizePath(path.resolve(mod.dirPath)))
                : undefined;
              const { hash, identifiers } = await computeModuleHash(mod.dirPath, modFiles);
              return {
                name: mod.name,
                dirPath: mod.dirPath,
                domain: mod.domain,
                identifiers,
                hash,
                shadowFile: shadowFileMap.get(mod.dirPath),
              };
            }),
          );

          const oldRegistry =
            (await loadNitsRegistry(cwd)) ||
            initNitsRegistry(inferProjectName(cwd));

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

          const nitsResult = reconcile(discovered, oldRegistry, cwd, {
            similarityThreshold: config.nits?.similarityThreshold,
          });

          reportReconciliation(nitsResult, log);

          const updatedNits = buildUpdatedNitsRegistry(
            nitsResult,
            oldRegistry.project,
          );
          await saveNitsRegistry(updatedNits, cwd);

          // Step 2.5c — Write shadow files for modules resolved by path/Jaccard (migration path).
          // Modules that arrived without a shadow file (legacy, pre-v1.5.5) now get one
          // written with the ID assigned during reconciliation. On the next boot they will
          // use the shadow-file path (Step 0) and bypass Jaccard entirely.
          const resolvedDirs = new Map<string, string>(
            resolvedModules.map((m) => [m.dirPath, m.name]),
          );
          // Pass all valid roots for shadow file creation guard
          postReconcileEnsureShadowFiles(
            nitsResult,
            resolvedDirs,
            modulesRoots,
          );

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

      // Step 5 — Activate runtime aliases (domains, modules, shared from scan)
      if (config.resolveAliases !== false) {
        const pureModuleAliases: Record<string, string> = {};

        for (const domain of registry.getAllDomains()) {
          const domainAlias = `@${domain.name}`;
          const _domainIndexPath = path.join(domain.path, 'index.ts'); // Fallback o real? El path del domain es dirPath.
          // Wait, domain has no indexPath in DomainRegistration?
          // DomainRegistration has `path` (dirPath)
          pureModuleAliases[domainAlias] = domain.path;
          pureModuleAliases[`${domainAlias}/*`] = `${domain.path}/*`;
          registry.registerAlias(domainAlias, domain.path);
          registry.registerAlias(`${domainAlias}/*`, `${domain.path}/*`);
        }

        for (const mod of resolvedModules) {
          if (mod.domain) {
            const domainAlias = `@${mod.domain}/${mod.name}`;
            pureModuleAliases[domainAlias] = mod.indexPath;
            pureModuleAliases[`${domainAlias}/*`] = `${mod.dirPath}/*`;
            registry.registerAlias(domainAlias, mod.indexPath);
            registry.registerAlias(`${domainAlias}/*`, `${mod.dirPath}/*`);
          }

          const aliasKey = `@modules/${mod.name}`;
          pureModuleAliases[aliasKey] = mod.indexPath;
          pureModuleAliases[`${aliasKey}/*`] = `${mod.dirPath}/*`;
          registry.registerAlias(aliasKey, mod.indexPath);
          registry.registerAlias(`${aliasKey}/*`, `${mod.dirPath}/*`);
        }

        // Shared aliases — same priority as domain aliases (before @modules/*)
        // @shared global
        const globalShared = registry.getShared('@shared');
        if (globalShared) {
          pureModuleAliases['@shared'] = globalShared.path;
          pureModuleAliases['@shared/*'] = `${globalShared.path}/*`;
        }

        // Domain-scoped shared
        for (const entry of registry.getAllShared().filter(e => e.type === 'domain-scoped')) {
          pureModuleAliases[entry.alias] = entry.path;
          pureModuleAliases[`${entry.alias}/*`] = `${entry.path}/*`;
        }

        const normalizedConfigAliases: Record<string, string> = {};
        for (const [alias, absPath] of config.resolvedAliases) {
          registry.registerAlias(alias, absPath);
          normalizedConfigAliases[alias] = absPath;
          log.debug(`Alias registered: ${alias} → ${absPath}`, {
            alias,
            finalTargetPath: absPath,
            source: "config",
            _module: "alias",
          });
        }

        // Registrar @modules como alias built-in
        if (config.modules) {
          const modulesDir = config.modules.replace(/\/\*$/, "");
          registry.registerAlias(
            "@modules",
            path.resolve(process.cwd(), modulesDir),
          );
        } else if (config.origin) {
          registry.registerAlias(
            "@modules",
            path.resolve(process.cwd(), config.origin),
          );
        }

        await activateAliasResolver(
          pureModuleAliases,
          normalizedConfigAliases,
          log,
        );
        updateAliasCache(registry.getAllAliases());
      }

      // Step 6 — Import index entries (paralelo por tipo) — runs identifiers

      // 6a — Domains en paralelo
      await Promise.all(
        scanResult.domains.map(async (domain) => {
          await importIndexEntry(domain.indexPath, config.moduleLoadTimeoutMs);
          log.info(`Domain loaded: ${pc.cyan(domain.name)}`, {
            _module: "domain",
            name: domain.name,
          });
        }),
      );

      // 6b — Modules en paralelo: import primero, correlación y validación después
      const importedModules = await Promise.all(
        resolvedModules.map(async (mod) => {
          const imported = await importIndexEntry(
            mod.indexPath,
            config.moduleLoadTimeoutMs,
          );
          return { mod, imported };
        }),
      );

      // Correlación y validación (CPU pura — mantiene el orden original)
      for (const { mod, imported } of importedModules) {
        const allRegistered = registry.getAllModules();
        const registeredMod = allRegistered.find(
          (m) => normalizePath(m.path) === normalizePath(mod.dirPath),
        );

        if (!registeredMod) {
          if (isOriginMode) {
            // Un index.ts sin identificador Kerith se ignora silenciosamente
            continue;
          } else {
            throw new KerithError(
              "MODULE_NOT_FOUND",
              `No index.ts found calling Module(). Add Module() to the module's index.ts.`,
              `File: ${mod.indexPath}`,
            );
          }
        }

        const moduleLabel = registeredMod.domain
          ? `${pc.dim(registeredMod.domain + "/")}${pc.green(registeredMod.name)}`
          : pc.green(registeredMod.name);

        log.info(`Module loaded: ${moduleLabel}`, {
          _module: "module",
          name: registeredMod.name,
          domain: registeredMod.domain,
          imports: registeredMod.imports,
          exports: registeredMod.exports,
          path: registeredMod.path,
        });

        const actualExports = Object.keys(imported).filter(
          (key) => key !== "default",
        );
        const declaredExports = registeredMod.exports || [];

        for (const declared of declaredExports) {
          if (!actualExports.includes(declared)) {
            throw new KerithError(
              "EXPORT_MISMATCH",
              `A name declared in exports does not exist as a real export of index.ts.`,
              `Module: ${registeredMod.name}, Missing Export: ${declared}`,
            );
          }
        }

        if (config.strict) {
          for (const actual of actualExports) {
            if (!declaredExports.includes(actual)) {
              log.warn(
                `Module "${registeredMod.name}" exports "${actual}" but it is not declared in Module() options "exports" array.`,
                {
                  name: registeredMod.name,
                  exportName: actual,
                  _module: "module",
                },
              );
            }
          }
        }
      }

      // 6c — Submodules en paralelo
      await Promise.all(
        scanResult.submodules.map(async (sub) => {
          await importIndexEntry(sub.indexPath, config.moduleLoadTimeoutMs);
          log.debug(`SubModule loaded: ${sub.name}`, {
            _module: "submodule",
            name: sub.name,
            parentModule: sub.parentModule,
            domain: sub.domain,
          });
        }),
      );

      const allModules = registry.getAllModules();

      for (const mod of allModules) {
        const rawMod = registry.getRawModule(mod.name, mod.domain);
        if (rawMod) {
          rawMod.imports = rawMod.imports.filter(
            (imp: string) => imp && imp.trim() !== "",
          );
          mod.imports = rawMod.imports;
        }
      }

      // Step 7 — Validate dependencies (strict mode only)
      if (config.strict) {
        for (const mod of allModules) {
          for (const importName of mod.imports) {
            if (!registry.hasModule(importName, mod.domain)) {
              throw new KerithError(
                "MISSING_IMPORT",
                `A module declared in imports does not exist in the registry.`,
                `Module "${mod.name}" is trying to import missing module "${importName}"`,
              );
            }
          }
        }
      }

      // Step 7.1 — Validate shared[] declarations
      for (const mod of allModules) {
        const rawMod = registry.getRawModule(mod.name, mod.domain);
        if (!rawMod || !rawMod.shared || rawMod.shared.length === 0) {
          continue;
        }

        for (const sharedAlias of rawMod.shared) {
          const error = (code: import("../core/errors.js").KerithErrorCode, message: string, details: string) => {
            if (config.strict) {
              throw new KerithError(code, message, details);
            } else {
              log.warn(message, { _module: "bootstrap", code, details });
            }
          };

          // Check if it's a Nodulus module alias (should be in imports[], not shared[])
          if (registry.hasModule(sharedAlias, mod.domain)) {
            error(
              "SHARED_IN_IMPORTS",
              `Module "${mod.name}" declares "${sharedAlias}" in shared[] but it is a Nodulus module alias.`,
              `Move "${sharedAlias}" from shared[] to imports[] in Module() for "${mod.name}".`,
            );
            continue;
          }

          // Check if it's '@shared' or a subpath of '@shared'
          const isSharedOrSubpath = sharedAlias === "@shared" || sharedAlias.startsWith("@shared/");
          if (!isSharedOrSubpath) {
            error(
              "UNDECLARED_SHARED",
              `Module "${mod.name}" declares "${sharedAlias}" in shared[] but it is not a valid shared alias.`,
              `shared[] only accepts '@shared' or subpaths of '@shared'. Remove "${sharedAlias}" from shared[] in Module() for "${mod.name}".`,
            );
            continue;
          }

          // Check if '@shared' is registered (folder exists)
          if (sharedAlias === "@shared") {
            const sharedEntry = registry.getShared("@shared");
            if (!sharedEntry) {
              error(
                "UNDECLARED_SHARED",
                `Module "${mod.name}" declares "@shared" in shared[] but @shared is not registered.`,
                `Ensure a shared folder exists or remove "@shared" from shared[] in Module() for "${mod.name}".`,
              );
            }
          }
        }
      }

      // Step 7.2 — Validate that imports[] doesn't contain shared aliases
      for (const mod of allModules) {
        const rawMod = registry.getRawModule(mod.name, mod.domain);
        if (!rawMod || !rawMod.imports || rawMod.imports.length === 0) {
          continue;
        }

        for (const importEntry of rawMod.imports) {
          if (importEntry.startsWith("@shared")) {
            const error = () => {
              if (config.strict) {
                throw new KerithError(
                  "SHARED_IN_IMPORTS",
                  `Module "${mod.name}" declares "${importEntry}" in imports[] but it is a shared alias.`,
                  `Move "${importEntry}" from imports[] to shared[] in Module() for "${mod.name}".`,
                );
              } else {
                log.warn(
                  `Module "${mod.name}" declares "${importEntry}" in imports[] but it is a shared alias.`,
                  {
                    _module: "bootstrap",
                    code: "SHARED_IN_IMPORTS",
                    details: `Move "${importEntry}" from imports[] to shared[] in Module() for "${mod.name}".`,
                  },
                );
              }
            };
            error();
          }
        }
      }

      // Step 7.5 — Undeclared / unused imports (strict)
      // Pre-process a Map of normalizedPath -> module ref (also used by Step 6)
      const modulePathMap = new Map<string, { name: string; domain?: string }>();
      for (const mod of allModules) {
        const rawMod = registry.getRawModule(mod.name, mod.domain);
        if (rawMod) {
          modulePathMap.set(normalizePath(rawMod.path), {
            name: mod.name,
            domain: mod.domain,
          });
        }
      }

      const sortedModulePaths = Array.from(modulePathMap.keys()).sort(
        (a, b) => b.length - a.length,
      );

      if (config.strict) {
        // Reuse cached files
        const allSourceFiles = allProjectFiles.filter((f) => {
          const base = path.basename(f);
          return !base.startsWith("index.") && !f.endsWith(".cjs");
        });

        // Build a Map of module -> source files
        const filesByModule = new Map<string, string[]>();
        for (const mod of allModules) {
          filesByModule.set(buildModuleKey(mod.name, mod.domain), []);
        }

        for (const file of allSourceFiles) {
          for (const modPath of sortedModulePaths) {
            if (file.startsWith(modPath + "/")) {
              const modRef = modulePathMap.get(modPath)!;
              filesByModule.get(buildModuleKey(modRef.name, modRef.domain))?.push(file);
              break;
            }
          }
        }

        for (const registeredMod of allModules) {
          const rawMod = registry.getRawModule(registeredMod.name, registeredMod.domain);
          if (!rawMod) continue;

          const sourceFiles =
            filesByModule.get(buildModuleKey(registeredMod.name, registeredMod.domain)) ?? [];
          const usedImports = new Set<string>();

          for (const file of sourceFiles) {
            const actualImports = extractModuleImports(
              file,
              registry.getRegisteredAliases(),
            );
            for (const imp of actualImports) {
              const parts = imp.specifier.split("/");
              const targetModule = imp.specifier.startsWith("@modules/")
                ? parts[1]
                : (parts[1] || parts[0]).replace(/^@/, "");
              if (!targetModule || targetModule === registeredMod.name)
                continue;

              if (!registry.hasModule(targetModule, registeredMod.domain)) continue;

              usedImports.add(targetModule);

              if (!registeredMod.imports.includes(targetModule)) {
                const message = `Module "${registeredMod.name}" imports from "${targetModule}" but it is not declared in imports[].`;
                const details = `File: ${path.normalize(file)}:${imp.line} — Add "${targetModule}" to Module() imports array for "${registeredMod.name}".`;

                throw new KerithError("UNDECLARED_IMPORT", message, details);
              }
            }
          }

          for (const declared of registeredMod.imports) {
            if (!usedImports.has(declared)) {
              const message = `Module "${registeredMod.name}" declares import "${declared}" but never uses it.`;
              throw new KerithError(
                "UNUSED_IMPORT",
                message,
                `Remove "${declared}" from imports[] in "${registeredMod.name}".`,
              );
            }
          }
        }
      }

      if (config.strict) {
        const cycles = registry.findCircularDependencies();
        if (cycles.length > 0) {
          const cycleStrings = cycles
            .map((cycle) => cycle.join(" -> "))
            .join(" | ");
          throw new KerithError(
            "CIRCULAR_DEPENDENCY",
            `Circular dependency detected. Extract the shared dependency into a separate module.`,
            `Cycles found: ${cycleStrings}`,
          );
        }
      }

      const mountedRoutes: import("../types/index.js").MountedRoute[] = [];

      if (app) {
      // Step 8 — Discover controllers and mount routes (Express only)
      // Reuse allProjectFiles but including index.* (controllers can be index files of subfolders, but not the module itself)
      const allControllerFiles = allProjectFiles.filter((f) => !f.includes(".types."));

      const controllerFilesByModule = new Map<string, string[]>();
      for (const mod of allModules) {
        controllerFilesByModule.set(buildModuleKey(mod.name, mod.domain), []);
      }

      for (const file of allControllerFiles) {
        const normalizedFile = normalizePath(file);
        for (const modPath of sortedModulePaths) {
          if (normalizedFile.startsWith(modPath + "/")) {
            const modRef = modulePathMap.get(modPath)!;
            const rawMod = registry.getRawModule(modRef.name, modRef.domain);

            if (rawMod && normalizedFile === normalizePath(rawMod.indexPath)) {
              // Exclude the module's main index file
              break;
            }

            controllerFilesByModule
              .get(buildModuleKey(modRef.name, modRef.domain))
              ?.push(file);
            break;
          }
        }
      }

      for (const mod of allModules) {
        const rawMod = registry.getRawModule(mod.name, mod.domain);
        if (!rawMod) continue;

        const files =
          controllerFilesByModule.get(buildModuleKey(mod.name, mod.domain)) ?? [];
        files.sort();

        for (let file of files) {
          log.debug(`Scanning controller file: ${file}`, {
            filePath: file,
            module: mod.name,
            _module: "router",
          });
          file = path.normalize(file);
          let imported: any;
          try {
            const importUrl = pathToFileURL(file).href;
            let timer: NodeJS.Timeout;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(
                  new KerithError(
                    "MODULE_LOAD_TIMEOUT",
                    `Controller load timed out after ${config.moduleLoadTimeoutMs}ms. Check for unhandled promises or blocking operations.`,
                    `File: ${file}`,
                  ),
                );
              }, config.moduleLoadTimeoutMs);
            });

            try {
              imported = await Promise.race([
                import(importUrl),
                timeoutPromise,
              ]);
            } finally {
              clearTimeout(timer!);
            }
          } catch (err: any) {
            if (err instanceof KerithError) throw err;
            throw new KerithError(
              "INVALID_CONTROLLER",
              `Failed to import controller file. Check for syntax errors or missing dependencies.`,
              `File: ${file} — ${err.message}`,
            );
          }

          const resolvedFile = normalizePath(file);
          const ctrlMeta = registry.getControllerMetadata(resolvedFile);
          if (ctrlMeta) {
            const isRouter =
              imported.default &&
              typeof imported.default === "function" &&
              typeof imported.default.use === "function";
            if (!isRouter) {
              throw new KerithError(
                "INVALID_CONTROLLER",
                `Controller has no default export of a Router. Add export default router.`,
                `File: ${file}`,
              );
            }
            ctrlMeta.router = imported.default;
            rawMod.controllers.push(ctrlMeta);
          }
        }

        // Note: modules with no controllers are valid (workers, email, listeners, etc.)
        // REGLA-01: Kerith does not require controllers — they are Express-specific.
      }

      // Step 8 — Mount routes
      for (const mod of allModules) {
        const rawMod = registry.getRawModule(mod.name, mod.domain);
        if (!rawMod) continue;

        for (const ctrl of rawMod.controllers) {
          if (!ctrl.enabled) {
            log.info(`Controller "${ctrl.name}" is disabled — skipping mount`, {
              _module: "router",
              module: mod.name,
              prefix: ctrl.prefix,
            });
            continue;
          }

          const fullPath =
            (config.prefix + ctrl.prefix)
              .replace(/\/+/g, "/")
              .replace(/\/$/, "") || "/";
          if (ctrl.router) {
            if (ctrl.middlewares && ctrl.middlewares.length > 0) {
              app.use(fullPath, ...ctrl.middlewares, ctrl.router);
            } else {
              app.use(fullPath, ctrl.router);
            }

            let foundRoutes = false;
            const extractedRoutes: { method: string; path: string }[] = [];

            if (ctrl.router.stack && Array.isArray(ctrl.router.stack)) {
              for (const layer of ctrl.router.stack) {
                const routeObj = (layer as any).route;
                if (routeObj && routeObj.methods) {
                  foundRoutes = true;
                  const routePath = routeObj.path;
                  const methods = Object.keys(routeObj.methods)
                    .filter((m) => routeObj.methods[m])
                    .map((m) => m.toUpperCase());

                  for (const method of methods) {
                    const fullRoutePath = (
                      fullPath + (routePath === "/" ? "" : routePath)
                    ).replace(/\/+/g, "/");
                    extractedRoutes.push({ method, path: fullRoutePath });
                    mountedRoutes.push({
                      method: method as any,
                      path: fullRoutePath,
                      module: mod.name,
                      controller: ctrl.name,
                    });
                  }
                }
              }
            }

            if (!foundRoutes) {
              extractedRoutes.push({ method: "USE", path: fullPath });
              mountedRoutes.push({
                method: "USE",
                path: fullPath,
                module: mod.name,
                controller: ctrl.name,
              });
            }

            const methodColors: Record<string, (msg: string) => string> = {
              GET: pc.green,
              POST: pc.yellow,
              PUT: pc.cyan,
              PATCH: pc.magenta,
              DELETE: pc.red,
              USE: pc.gray,
            };

            for (const route of extractedRoutes) {
              const colorFn = methodColors[route.method] || pc.white;
              log.info(
                `  ${colorFn(route.method.padEnd(6))} ${pc.white(route.path)}  ${pc.gray(`(${ctrl.name})`)}`,
                {
                  _module: "router",
                  path: route.path,
                  module: mod.name,
                  controller: ctrl.name,
                },
              );
            }
          }
        }
      }

      (app as any).__KerithBootstrapped = true;
      } // end if (app)

      const safeRegisteredModules = allModules.map(
        (m) => registry.getModule(m.name, m.domain)!,
      );
      const durationMs = Math.round(performance.now() - startTime);

      if (app) {
        log.info(`Mounted ${mountedRoutes.length} route(s)`, {
          _module: "router",
        });
      }

      const domainCount = scanResult.domains.length;
      const submoduleCount = scanResult.submodules.length;
      const endTime = performance.now();
      const ms = Math.round(endTime - startTime);
      
      if (usedCache) {
        log.info(`bootstrap desde cache — ${ms}ms (${numRescanned} módulos re-escaneados)`);
      } else {
        log.info(`bootstrap completo — ${ms}ms ${cacheLogReason || '(primer arranque)'}`.trim());
      }

      if (cacheEnabled) {
        // Build cache data payload from scan modules (source of truth for options/imports/exports/shared)
        // combined with NITS IDs from the registry and file lists from the NITS step.
        const modulesForCache: CachedModule[] = scanResult.modules.map(scanMod => {
          // Retrieve NITS ID from registry (seeded in Step 4). Falls back to dirPath-based temp ID.
          const registeredMod = registry.getModule(scanMod.name, scanMod.domain);
          const nitsId = registeredMod?.id ?? `mod_${Buffer.from(scanMod.dirPath).toString('hex').slice(0, 8)}`;

          // Retrieve files from the NITS step file map
          let files: string[] = [];
          if (filesByModulePath) {
            files = filesByModulePath.get(normalizePath(path.resolve(scanMod.dirPath))) || [];
          }
          const cachedSize = files.reduce((acc, f) => acc + (fs.existsSync(f) ? fs.statSync(f).size : 0), 0);

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
          };
        });

        CacheManager.write({
          domains: scanResult.domains,
          modules: modulesForCache,
          submodules: scanResult.submodules,
          shared: scanResult.shared,
          identifiers: [],
          aliases: [],
        }, KERITH_VERSION, configHash);
      }

      return {
        modules: safeRegisteredModules,
        routes: mountedRoutes,
        registry,
        runtime: {
          preloaderActive,
          preloaderVersion: preloadConfig?._version ?? null,
          aliasesAtBoot: preloadConfig?.aliases ?? {},
        },
        listen(server, listenOptions) {
          return registerShutdown({
            server,
            onShutdown: listenOptions?.onShutdown,
            logger: log,
          });
        },
      };
    } catch (err: any) {
      if (cacheEnabled) {
        CacheManager.fail(err.message);
      }
      registry.clearRegistry();
      throw err;
    }
  });
}
