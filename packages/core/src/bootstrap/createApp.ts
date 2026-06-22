// Node.js
import { performance } from "node:perf_hooks";

// External dependencies
import type { Application } from "express";

// Framework core
import { CacheManager } from "../cache/bootstrap-cache.js";
import { createRegistry, registryContext } from "../core/registry.js";
import { registerShutdown } from "../core/shutdown.js";
import type { CreateAppOptions, KerithApp } from "../types/index.js";

// Bootstrap
import type { BootstrapContext } from "./context.js";
import { runGuard } from "./steps/step-00-guard.js";
import { runConfigLoad } from "./steps/step-01-config.js";
import { runSetupPhase } from "./steps/step-01b-setup.js";
import { runCacheAndScan } from "./steps/step-02-cache-scan.js";
import { runEntityRegistration } from "./steps/step-03-register.js";
import { runNitsReconciliation } from "./steps/step-04-nits.js";
import { runAliasActivation } from "./steps/step-05-aliases.js";
import { runDynamicImports } from "./steps/step-06-imports.js";
import { runValidations } from "./steps/step-07-validations.js";
import { runControllersAndMount } from "./steps/step-08-controllers.js";
import { runCacheWrite } from "./steps/step-09-cache-write.js";
import { KERITH_VERSION } from "./version.js";

export { KERITH_VERSION };

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

      const {
        scanResult,
        resolvedModules,
        usedCache,
        numRescanned,
        cacheLogReason,
      } = ctx;
      if (!scanResult || !resolvedModules) throw new Error("Scanner failed");

      // Step 03 — Entity Registration & File Prefetch
      await runEntityRegistration(ctx);

      // Step 04 — NITS identity reconciliation
      await runNitsReconciliation(ctx);

      // Step 05 — Activate runtime aliases (domains, modules, shared from scan)
      await runAliasActivation(ctx);

      // Step 06 — Dynamic Imports
      await runDynamicImports(ctx);

      // Step 07 — Validate dependencies (strict mode only)
      await runValidations(ctx);

      const allModules = ctx.allModules ?? [];

      // Step 08 — Discover controllers and mount routes (Express only)
      await runControllersAndMount(ctx, app);
      const mountedRoutes = ctx.mountedRoutes ?? [];

      const safeRegisteredModules = allModules.map(
        (m) => registry.getModule(m.name, m.domain)!,
      );

      if (app) {
        log.info(`Mounted ${mountedRoutes.length} route(s)`, {
          _module: "router",
        });
      }

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
      runCacheWrite(ctx);

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
