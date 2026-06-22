import type { Application } from "express";
import type { CreateAppOptions, KerithApp } from "../types/index.js";
import { runConfigLoad } from "./steps/step-01-config.js";
import { runSetupPhase } from "./steps/step-01b-setup.js";
import { runCacheAndScan } from "./steps/step-02-cache-scan.js";
import { runEntityRegistration } from "./steps/step-03-register.js";
import { runNitsReconciliation } from "./steps/step-04-nits.js";
import { runDynamicImports } from "./steps/step-06-imports.js";
import { runValidations } from "./steps/step-07-validations.js";
import { runControllersAndMount } from "./steps/step-08-controllers.js";
import { createRegistry, registryContext } from "../core/registry.js";
import { runAliasActivation } from "./steps/step-05-aliases.js";
import { performance } from "node:perf_hooks";
import { registerShutdown } from "../core/shutdown.js";
import { CacheManager } from "../cache/bootstrap-cache.js";
import { runGuard } from "./steps/step-00-guard.js";
import { runCacheWrite } from "./steps/step-09-cache-write.js";
import { KERITH_VERSION } from "./version.js";
import type { BootstrapContext } from "./context.js";

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
      ctx = { cwd: process.cwd(), options, registry };

      await runConfigLoad(ctx);
      await runSetupPhase(ctx);

      const { config, log } = ctx;
      if (!config || !log) throw new Error("Config load failed");

      await runCacheAndScan(ctx);

      if (!ctx.scanResult || !ctx.resolvedModules) throw new Error("Scanner failed");

      await runEntityRegistration(ctx);
      await runNitsReconciliation(ctx);
      await runAliasActivation(ctx);
      await runDynamicImports(ctx);
      await runValidations(ctx);
      await runControllersAndMount(ctx, app);

      const allModules = ctx.allModules ?? [];
      const mountedRoutes = ctx.mountedRoutes ?? [];

      const safeRegisteredModules = allModules.map(
        (m) => registry.getModule(m.name, m.domain)!,
      );

      if (app) {
        log.info(`Mounted ${mountedRoutes.length} route(s)`, {
          _module: "router",
        });
      }

      const ms = Math.round(performance.now() - startTime);

      if (ctx.usedCache) {
        log.info(
          `Bootstrap complete from cache — ${ms}ms (${ctx.numRescanned} modules rescanned)`,
          {
            _module: "boot",
            durationMs: ms,
            moduleCount: allModules.length,
            routeCount: mountedRoutes.length,
          },
        );
      } else {
        log.info(
          `Bootstrap complete — ${ms}ms ${ctx.cacheLogReason || "(first boot)"}`.trim(),
          {
            _module: "boot",
            durationMs: ms,
            moduleCount: allModules.length,
            routeCount: mountedRoutes.length,
          },
        );
      }

      runCacheWrite(ctx);

      return {
        modules: safeRegisteredModules,
        routes: mountedRoutes,
        registry,
        runtime: {
          preloaderActive: ctx.preloaderActive ?? false,
          preloaderVersion: ctx.preloadConfig?._version ?? null,
          aliasesAtBoot: ctx.preloadConfig?.aliases ?? {},
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
