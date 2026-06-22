import fs from "node:fs";
import path from "node:path";
import type { Application } from "express";
import type { CreateAppOptions, KerithApp } from "../types/index.js";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";
import { runConfigLoad } from "./steps/step-01-config.js";
import { runSetupPhase } from "./steps/step-01b-setup.js";
import { runCacheAndScan } from "./steps/step-02-cache-scan.js";
import { runEntityRegistration } from "./steps/step-03-register.js";
import { runNitsReconciliation } from "./steps/step-04-nits.js";
import { runDynamicImports } from "./steps/step-06-imports.js";
import { runValidations } from "./steps/step-07-validations.js";
import { KerithError } from "../core/errors.js";
import {
  createRegistry,
  registryContext,
  buildModuleKey,
} from "../core/registry.js";
import { runAliasActivation } from "./steps/step-05-aliases.js";
import { performance } from "node:perf_hooks";
import pc from "picocolors";
import { normalizePath, groupFilesByModulePath } from "../core/utils/paths.js";
import { registerShutdown } from "../core/shutdown.js";
import { scanFromConfig, scanModulesToResolved } from "./scanner.js";
import { importIndexEntry } from "./import-index.js";
import { CacheManager } from "../cache/bootstrap-cache.js";
import { MtimeValidator } from "../cache/mtime-validator.js";
import { runGuard } from "./steps/step-00-guard.js";
import { runCacheWrite } from "./steps/step-09-cache-write.js";
import type { BootstrapContext } from "./context.js";

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
  return "unknown";
};

export const KERITH_VERSION = getKerithVersion();

export async function createApp(
  app?: Application,
  options: CreateAppOptions = {},
): Promise<KerithApp> {
  // Step 00 — Bootstrap precondition guards (duplicate check + ESM validation)
  runGuard(app);

  const registry = createRegistry();

  return registryContext.run(registry, async () => {
    const startTime = performance.now();
    let ctx: BootstrapContext | undefined;
    try {
      const cwd = process.cwd();
      ctx = { cwd, options, registry };

      // Step 01 — Load configuration
      await runConfigLoad(ctx);

      // Step 01b — Setup & Pre-validation
      await runSetupPhase(ctx);

      const { config, log, preloaderActive, preloadConfig } = ctx;
      if (!config || !log) throw new Error("Config load failed");

      // Step 02 — Cache Decision & Scanner
      await runCacheAndScan(ctx);

      const { scanResult, resolvedModules, usedCache, numRescanned, cacheLogReason, isFullCacheHit, cacheEnabled, configHash } = ctx;
      const rescannedDomains = ctx.rescannedDomains ?? new Set<string>();
      const isOriginMode = !!config.origin;
      if (!scanResult || !resolvedModules) throw new Error("Scanner failed");

      // Step 03 — Entity Registration & File Prefetch
      await runEntityRegistration(ctx);

      // Step 04 — NITS identity reconciliation
      await runNitsReconciliation(ctx);

      const allProjectFiles = ctx.allProjectFiles ?? [];
      const filesByModulePath = ctx.filesByModulePath;

      // Step 05 — Activate runtime aliases (domains, modules, shared from scan)
      await runAliasActivation({
        options,
        config,
        log,
        registry,
        resolvedModules,
        cwd,
      } as BootstrapContext);

      // Step 06 — Dynamic Imports
      await runDynamicImports(ctx);

      // Step 07 — Validate dependencies (strict mode only)
      runValidations(ctx);

      const allModules = ctx.allModules ?? [];
      const modulePathMap = ctx.modulePathMap!;
      const sortedModulePaths = ctx.sortedModulePaths ?? [];



      const mountedRoutes: import("../types/index.js").MountedRoute[] = [];

      if (app) {
        const step8DiscoverStart = performance.now();
        // Step 8 — Discover controllers and mount routes (Express only)
        // Kerith contract: any file inside a module can be a controller if it calls Controller()
        // and exports a default Router. We use a fast text heuristic to avoid dynamically
        // importing every file in the project (which is O(n) slow).
        const allControllerFiles = allProjectFiles.filter((f) => {
          const base = path.basename(f);
          if (base.startsWith("index.") || !/\.[cm]?[tj]s$/.test(base) || f.endsWith(".cjs")) {
            return false;
          }
          try {
            // Fast heuristic: it must contain the Controller decorator/identifier
            return fs.readFileSync(f, "utf8").includes("Controller");
          } catch {
            return false;
          }
        });

        const controllerFilesByModule = new Map<string, string[]>();
        for (const mod of allModules) {
          controllerFilesByModule.set(buildModuleKey(mod.name, mod.domain), []);
        }

        const groupedControllers = groupFilesByModulePath(allControllerFiles, sortedModulePaths);
        for (const [modPath, files] of groupedControllers) {
          const modRef = modulePathMap.get(modPath);
          if (modRef) {
            const key = buildModuleKey(modRef.name, modRef.domain);
            const rawMod = registry.getRawModule(modRef.name, modRef.domain);
            const indexPathNorm = rawMod ? normalizePath(rawMod.indexPath) : null;

            for (const file of files) {
              if (normalizePath(file) !== indexPathNorm) {
                controllerFilesByModule.get(key)?.push(file);
              }
            }
          }
        }

        // Step 8a — Flatten all (mod, file) pairs and import ALL controller files in parallel.
        // Pattern mirrors Step 6b: import in parallel → validate in original order.
        // This eliminates the O(n) sequential await chain that was the primary bottleneck
        // confirmed by bench: step8_discover scaled linearly (~8ms/module at n=50).

        // 1. Build the flat work list (preserve mod + sorted file order for determinism)
        interface ControllerImportTask {
          mod: (typeof allModules)[number];
          rawMod: NonNullable<ReturnType<typeof registry.getRawModule>>;
          file: string; // normalized
          importUrl: string;
        }

        const controllerTasks: ControllerImportTask[] = [];
        for (const mod of allModules) {
          const rawMod = registry.getRawModule(mod.name, mod.domain);
          if (!rawMod) continue;

          const files =
            controllerFilesByModule.get(buildModuleKey(mod.name, mod.domain)) ??
            [];
          files.sort();

          for (const file of files) {
            log.debug(`Scanning controller file: ${file}`, {
              filePath: file,
              module: mod.name,
              _module: "router",
            });
            controllerTasks.push({
              mod,
              rawMod,
              file: path.normalize(file),
              importUrl: pathToFileURL(path.normalize(file)).href,
            });
          }
        }

        // 2. Import all controller files in parallel with per-file timeout
        const importResults = await Promise.all(
          controllerTasks.map(async (task) => {
            let timer: NodeJS.Timeout;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(
                  new KerithError(
                    "MODULE_LOAD_TIMEOUT",
                    `Controller load timed out after ${config.rules.moduleLoadTimeout}ms. Check for unhandled promises or blocking operations.`,
                    `File: ${task.file}`,
                  ),
                );
              }, config.rules.moduleLoadTimeout);
            });

            let imported: any;
            try {
              imported = await Promise.race([
                import(task.importUrl),
                timeoutPromise,
              ]);
            } catch (err: any) {
              if (err instanceof KerithError) throw err;
              throw new KerithError(
                "INVALID_CONTROLLER",
                `Failed to import controller file. Check for syntax errors or missing dependencies.`,
                `File: ${task.file} — ${err.message}`,
              );
            } finally {
              clearTimeout(timer!);
            }

            return { task, imported };
          }),
        );

        // 3. Validate and register in original order (pure CPU — no I/O)
        for (const { task, imported } of importResults) {
          const { mod, rawMod, file } = task;
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

        const step8DiscoverMs = performance.now() - step8DiscoverStart;

        // Step 8 — Mount routes
        const step8Start = performance.now();
        let mountMs = 0;
        let logMs = 0;

        for (const mod of allModules) {
          const rawMod = registry.getRawModule(mod.name, mod.domain);
          if (!rawMod) continue;

          let loggedRouteCount = 0;
          const LOG_ROUTE_LIMIT = config.logging.maxRouteLines;

          for (const ctrl of rawMod.controllers) {
            if (!ctrl.enabled) {
              log.info(
                `Controller "${ctrl.name}" is disabled — skipping mount`,
                {
                  _module: "router",
                  module: mod.name,
                  prefix: ctrl.prefix,
                },
              );
              continue;
            }

            const fullPath =
              (config.prefix + ctrl.prefix)
                .replace(/\/+/g, "/")
                .replace(/\/$/, "") || "/";
            if (ctrl.router) {
              const tMount = performance.now();
              if (ctrl.middlewares && ctrl.middlewares.length > 0) {
                app.use(fullPath, ...ctrl.middlewares, ctrl.router);
              } else {
                app.use(fullPath, ctrl.router);
              }
              mountMs += performance.now() - tMount;

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

              const tLog = performance.now();

              for (const route of extractedRoutes) {
                if (loggedRouteCount < LOG_ROUTE_LIMIT) {
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
                loggedRouteCount++;
              }

              logMs += performance.now() - tLog;
            }
          }

          if (loggedRouteCount > LOG_ROUTE_LIMIT) {
            log.info(
              `  ... and ${loggedRouteCount - LOG_ROUTE_LIMIT} more route(s) mounted (total: ${loggedRouteCount})`,
              { _module: "router", module: mod.name },
            );
          }
        }

        const step8Ms = performance.now() - step8Start;
        log.debug(
          `[perf] step8_discover=${step8DiscoverMs.toFixed(2)}ms step8_mount=${mountMs.toFixed(2)}ms step8_log=${logMs.toFixed(2)}ms step8_total=${step8Ms.toFixed(2)}ms step8_full=${(step8DiscoverMs + step8Ms).toFixed(2)}ms`,
          { _module: "boot" },
        );
        // When KERITH_PROFILE=true, also write directly to stderr so benchmarks
        // can capture it regardless of the configured logLevel.
        if (process.env.KERITH_PROFILE === "true") {
          process.stderr.write(
            `[perf] step8_discover=${step8DiscoverMs.toFixed(2)}ms step8_mount=${mountMs.toFixed(2)}ms step8_log=${logMs.toFixed(2)}ms step8_total=${step8Ms.toFixed(2)}ms step8_full=${(step8DiscoverMs + step8Ms).toFixed(2)}ms\n`,
          );
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
        log.info(
          `Bootstrap complete from cache — ${ms}ms (${numRescanned} modules rescanned)`,
          {
            _module: "boot",
            durationMs: ms,
            moduleCount: allModules.length,
            routeCount: mountedRoutes.length,
          },
        );
      } else {
        log.info(
          `Bootstrap complete — ${ms}ms ${cacheLogReason || "(first boot)"}`.trim(),
          {
            _module: "boot",
            durationMs: ms,
            moduleCount: allModules.length,
            routeCount: mountedRoutes.length,
          },
        );
      }

      // Step 09 — Bootstrap Cache Write
      runCacheWrite({
        cwd,
        options,
        registry,
        cacheEnabled,
        scanResult,
        configHash,
        filesByModulePath,
      } as BootstrapContext);

      return {
        modules: safeRegisteredModules,
        routes: mountedRoutes,
        registry,
        runtime: {
          preloaderActive: preloaderActive ?? false,
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
      if (ctx?.cacheEnabled) {
        CacheManager.fail(err.message);
      }
      registry.clearRegistry();
      throw err;
    }
  });
}
