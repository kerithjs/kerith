/**
 * @file bootstrap/steps/step-08-controllers.ts
 *
 * Step 08 — Discover controllers and mount routes (Express only)
 *
 * Uses a heuristic to fast-find controllers without importing every file.
 * Controller files are then dynamically imported in parallel.
 * Finally, the routers are mounted to the Express application sequentially.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { BootLogGate } from "../../core/utils/boot-log-limit.js";
import pc from "picocolors";
import { KerithError } from "../../core/errors.js";
import { normalizePath, groupFilesByModulePath } from "../../core/utils/paths.js";
import { withTimeout } from "../../core/utils/timeout.js";
import { buildModuleKey } from "../../core/registry.js";
import { getRegisteredMiddlewareResolvers } from "../../extension/store.js";
import { buildRouterFromClass } from "./app-controller-bridge.js";
import type { BootstrapContext } from "../context.js";
import type { Application } from "express";
import type { MountedRoute } from "../../types/index.js";

export async function runControllersAndMount(
  ctx: BootstrapContext,
  app: Application | undefined,
): Promise<void> {
  const mountedRoutes: MountedRoute[] = [];
  ctx.mountedRoutes = mountedRoutes; // Ensure it's available even if app is undefined

  if (!app) {
    return; // Kerith logic: If no express app is passed, skip discovery & mounting
  }

  const { config, log, registry, allModules, allProjectFiles, modulePathMap, sortedModulePaths } = ctx;

  // Since @kerith/app uses Symbol.for, we can just look up the global symbol
  // without needing to dynamically import the package (which might fail in some
  // strict package manager setups or tests where it's a peer dependency).
  const KERITH_CONTROLLER = Symbol.for('kerith:controller');


  if (!config || !log || !allModules || !allProjectFiles || !modulePathMap || !sortedModulePaths) {
    throw new Error("runControllersAndMount requires config, log, allModules, allProjectFiles, modulePathMap, sortedModulePaths in context");
  }

  const step8DiscoverStart = performance.now();

  // Kerith contract: any file inside a module can be a controller if it calls Controller()
  // and exports a default Router. We use a fast text heuristic to avoid dynamically
  // importing every file in the project (which is O(n) slow).
  const controllerCandidates = allProjectFiles.filter((f) => {
    const base = path.basename(f);
    return !(base.startsWith("index.") || !/\.[cm]?[tj]s$/.test(base) || f.endsWith(".cjs"));
  });

  const heuristicResults = await Promise.all(
    controllerCandidates.map(async (f) => {
      try {
        const content = await fs.promises.readFile(f, "utf8");
        return { f, isController: content.includes("Controller") };
      } catch {
        return { f, isController: false };
      }
    })
  );

  const allControllerFiles = heuristicResults
    .filter((r) => r.isController)
    .map((r) => r.f);

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
      controllerFilesByModule.get(buildModuleKey(mod.name, mod.domain)) ?? [];
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
      let imported: any;
      try {
        imported = await withTimeout(
          import(task.importUrl),
          config.rules.moduleLoadTimeout,
          () =>
            new KerithError(
              "MODULE_LOAD_TIMEOUT",
              `Controller load timed out after ${config.rules.moduleLoadTimeout}ms. Check for unhandled promises or blocking operations.`,
              `File: ${task.file}`,
            ),
        );
      } catch (err: any) {
        if (err instanceof KerithError) throw err;
        throw new KerithError(
          "INVALID_CONTROLLER",
          `Failed to import controller file. Check for syntax errors or missing dependencies.`,
          `File: ${task.file} — ${err.message}`,
        );
      }

      return { task, imported };
    }),
  );

  // 3. Validate and register in original order (pure CPU — no I/O)
  for (const { task, imported } of importResults) {
    const { rawMod, file } = task;
    const resolvedFile = normalizePath(file);
    let ctrlMeta = registry.getControllerMetadata(resolvedFile);

    // Synthesis: if class-based controller decorator is present, register metadata
    // Note: if both Controller() function and @Controller decorator are present,
    // the function wins (ctrlMeta already exists from the function call during import)
    if (!ctrlMeta && KERITH_CONTROLLER && imported.default?.[KERITH_CONTROLLER]) {
      const decoratorMeta = imported.default[KERITH_CONTROLLER] as any;
      registry.registerControllerMetadata({
        name: path.parse(file).name,
        path: resolvedFile,
        prefix: decoratorMeta.prefix,
        middlewares: decoratorMeta.middlewares || [],
        enabled: decoratorMeta.enabled ?? true,
        metadata: decoratorMeta.metadata,
      });
      // Re-read so the mount block below sees the newly registered entry
      ctrlMeta = registry.getControllerMetadata(resolvedFile);
    }

    if (ctrlMeta) {
      // Check if this is a class-based controller (decorator) or traditional router
      const isClassBased = KERITH_CONTROLLER && imported.default?.[KERITH_CONTROLLER];
      const isRouter =
        imported.default &&
        typeof imported.default === "function" &&
        typeof imported.default.use === "function";

      if (isClassBased) {
        // Build router from class using buildRouterFromClass
        const decoratorMeta = (imported.default as any)[KERITH_CONTROLLER!];

        try {
          ctrlMeta.router = buildRouterFromClass(imported.default, decoratorMeta);
        } catch (err: any) {
          throw new KerithError(
            "INVALID_CONTROLLER",
            `Failed to build router from class-based controller: ${err.message}`,
            `File: ${file}`,
          );
        }
      } else if (isRouter) {
        // Traditional router function
        ctrlMeta.router = imported.default;
      } else {
        throw new KerithError(
          "INVALID_CONTROLLER",
          `Controller has no default export of a Router. Add export default router.`,
          `File: ${file}`,
        );
      }
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
  const routeLogGate = new BootLogGate(config.logLevel);

  // Get extension middlewares and sort them by priority (descending: higher runs first)
  const allResolvers = getRegisteredMiddlewareResolvers();
  const preResolvers = allResolvers.filter(r => r.phase === 'pre').sort((a, b) => b.priority - a.priority);
  const postResolvers = allResolvers.filter(r => r.phase === 'post').sort((a, b) => b.priority - a.priority);
  const errorResolvers = allResolvers.filter(r => r.phase === 'error').sort((a, b) => b.priority - a.priority);

  const postMounts: { path: string; handlers: any[] }[] = [];
  const globalErrorHandlers = new Set<any>();

  // 2.2 fix: error handlers are global and must be mounted exactly once.
  // getHandlers() is called ONCE PER RESOLVER here (not once per controller
  // as pre/post resolvers are below) — this avoids the identity-dedup Set
  // multi-mounting a logically-single Filter whose getHandlers() happens to
  // return a fresh closure on every call. Error handlers are assumed not to
  // need per-controller context (see extension/types.ts JSDoc for phase 'error').
  const anyControllerForErrorContext = allModules
    .map((mod) => registry.getRawModule(mod.name, mod.domain))
    .flatMap((rawMod) => rawMod?.controllers ?? [])[0];

  for (const resolver of errorResolvers) {
    let handlers: unknown[];
    try {
      handlers = resolver.getHandlers(anyControllerForErrorContext as any);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new KerithError(
        'MIDDLEWARE_RESOLUTION_FAILED',
        `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
        `File: ${resolver.filePath} — ${message}`
      );
    }
    for (const handler of handlers) {
      // 2.3 fix: Express only treats a middleware as an error handler if it
      // declares exactly 4 parameters (err, req, res, next). A resolver that
      // gets this wrong would otherwise fail silently in production —
      // Express would mount it as normal middleware, never invoked on error.
      if (typeof handler === "function" && handler.length !== 4) {
        log.warn(
          `A MiddlewareResolver with phase 'error' returned a handler with ${handler.length} parameter(s) instead of 4 — Express will not treat it as an error handler and it will never run on error.`,
          { _module: "router" },
        );
      }
      globalErrorHandlers.add(handler);
    }
  }

  for (const mod of allModules) {
    const rawMod = registry.getRawModule(mod.name, mod.domain);
    if (!rawMod) continue;

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

        // Execute extension resolvers for this specific controller.
        // Error-phase resolvers are handled once, above, outside this loop.
        let preMiddlewares: unknown[];
        try {
          preMiddlewares = preResolvers.flatMap(r => r.getHandlers(ctrl));
        } catch (err: unknown) {
          const resolver = preResolvers.find(r => {
            try {
              r.getHandlers(ctrl);
              return false;
            } catch {
              return true;
            }
          });
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver?.name || 'unknown'}" failed during getHandlers() execution`,
            `File: ${resolver?.filePath || 'unknown'} — ${message}`
          );
        }

        let postMiddlewares: unknown[];
        try {
          postMiddlewares = postResolvers.flatMap(r => r.getHandlers(ctrl));
        } catch (err: unknown) {
          const resolver = postResolvers.find(r => {
            try {
              r.getHandlers(ctrl);
              return false;
            } catch {
              return true;
            }
          });
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver?.name || 'unknown'}" failed during getHandlers() execution`,
            `File: ${resolver?.filePath || 'unknown'} — ${message}`
          );
        }

        const allPreMiddlewares = [
          ...preMiddlewares,
          ...(ctrl.middlewares || []),
          ctrl.router
        ];

        app.use(fullPath, ...(allPreMiddlewares as any[]));
        
        if (postMiddlewares.length > 0) {
          postMounts.push({ path: fullPath, handlers: postMiddlewares });
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
          if (routeLogGate.next()) {
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

        logMs += performance.now() - tLog;
      }
    }

  }

  // Mount post middlewares after all routers
  for (const mount of postMounts) {
    app.use(mount.path, ...mount.handlers);
  }

  // Mount error handlers exactly once at the end of the app
  if (globalErrorHandlers.size > 0) {
    app.use(...Array.from(globalErrorHandlers));
  }

  if (routeLogGate.hasOverflow) {
    log.info(
      `  ... and ${routeLogGate.overflow} more route(s) mounted (total: ${routeLogGate.total})`,
      { _module: "router" },
    );
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
}
