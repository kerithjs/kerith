// Node.js
import { performance } from "node:perf_hooks";

// External dependencies
import type { Application } from "express";

// Framework core
import { CacheManager } from "../cache/bootstrap-cache.js";
import { createRegistry, registryContext } from "../core/registry.js";
import { registerShutdown } from "../core/shutdown.js";
import { KerithError } from "../core/errors.js";
import { getRegisteredScheduleProviders, getRegisteredAliasProviders, getRegisteredBindingProviders } from "../extension/store.js";
import { getAliasRuntime } from "../aliases/runtime.js";
import { updateAliasCache } from "../aliases/cache.js";
import type { CreateAppOptions, KerithApp } from "../types/index.js";

// Bootstrap
import type { BootstrapContext } from "./context.js";
import { runGuard, markBootstrapped, releaseBootstrap } from "./steps/step-00-guard.js";
import { runConfigLoad } from "./steps/step-01-config.js";
import { runSetupPhase } from "./steps/step-01b-setup.js";
import { runCacheAndScan } from "./steps/step-02-cache-scan.js";
import { runEntityRegistration } from "./steps/step-03-register.js";
import { runNitsReconciliation } from "./steps/step-04-nits.js";
import { runAliasActivation } from "./steps/step-05-aliases.js";
import { runVirtualAliases } from "./steps/step-05b-virtual-aliases.js";
import { runDynamicImports } from "./steps/step-06-imports.js";
import { runEagerAliases } from "./steps/step-06b-eager-aliases.js";
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

      // Inject the bootstrap logger into the alias runtime so non-required
      // alias failures are reported through `log.warn` instead of console.
      getAliasRuntime().setLogger(log);

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

      // Step 05b — Virtual alias hooks (Level 1 alias channel)
      await runVirtualAliases(ctx);

      // Step 06 — Dynamic Imports
      await runDynamicImports(ctx);

      // Invoke the internal hook for @kerith/app so it can map plugins to providers
      if (options?._onDynamicImportsComplete) {
        await options._onDynamicImportsComplete();
      }

      // --- Extension API: Alias Providers ---
      // At this point, modules have been evaluated and alias providers have been registered.
      // Register them into the registry with destination `kerith-alias:<prefix>/<name>`
      // marked as virtual so getAliases() excludes them from bundler output, and register
      // them into getAliasRuntime() if not already declared.
      const extensionAliases = getRegisteredAliasProviders();
      if (extensionAliases.length > 0 && ctx.config?.resolveAliases !== false) {
        const runtime = getAliasRuntime();
        for (const provider of extensionAliases) {
          const fullAlias = `@${provider.prefix}/${provider.name}`;
          const target = `kerith-alias:${provider.prefix}/${provider.name}`;
          registry.registerAlias(fullAlias, target, { virtual: true });
          const key = `${provider.prefix}/${provider.name}`;
          if (!runtime.declarations.has(key)) {
            runtime.declare({
              prefix: provider.prefix as any,
              name: provider.name,
              filePath: provider.filePath,
              factory: provider.resolve,
              options: provider.options ?? {},
            });
          }
        }
        updateAliasCache(registry.getAllAliases());
      }

      // Step 06b — Eager alias resolution (lazy: false, the default)
      // Runs after dynamic imports and provider mapping so all declarations are present.
      await runEagerAliases(ctx);

      // Execute bindings sequentially to guarantee predictability
      const bindings = getRegisteredBindingProviders();
      for (const provider of bindings) {
        const bindStart = performance.now();
        try {
          await provider.bind();
          if (process.env.KERITH_PROFILE === "true") {
            log.debug(
              `[perf] binding ${provider.name} took ${Math.round(performance.now() - bindStart)}ms`,
              { _module: "boot" },
            );
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'BINDING_EXECUTION_FAILED',
            `Binding provider "${provider.name}" failed during bind() execution`,
            message
          );
        }
      }

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

      // Execute 'after-bootstrap' schedules
      const schedules = getRegisteredScheduleProviders();
      const afterBootstrapSchedules = schedules.filter(s => s.timing === 'after-bootstrap');
      for (const schedule of afterBootstrapSchedules) {
        try {
          await schedule.execute();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Extension schedule ${schedule.name} threw an error during after-bootstrap: ${message}`, { _module: 'boot' });
        }
      }

      // Mark bootstrap as complete — process-level singleton sealed.
      markBootstrapped();

      return {
        modules: safeRegisteredModules,
        routes: mountedRoutes,
        registry,
        runtime: {
          preloaderActive: preloaderActive ?? false,
          preloaderVersion: preloadConfig?._version ?? null,
          aliasesAtBoot: preloadConfig?.aliases ?? {},
        },
        async listen(server, listenOptions) {
          // Execute 'on-listen' schedules
          const onListenSchedules = getRegisteredScheduleProviders().filter(s => s.timing === 'on-listen');
          for (const schedule of onListenSchedules) {
            try {
              await schedule.execute();
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              log.error(`Extension schedule ${schedule.name} threw an error during on-listen: ${message}`, { _module: 'boot' });
            }
          }

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
      releaseBootstrap();
      throw err;
    }
  });
}
