/**
 * @file bootstrap/steps/step-06-imports.ts
 *
 * Step 06 — Dynamic Imports
 *
 * Imports the actual files from disk for domains, modules, and submodules.
 * Running this step causes Node to parse and evaluate the code, running the
 * Kerith decorators (which write metadata back into our registry).
 * 
 * Order is strictly preserved: Domains first, then Modules, then Submodules.
 */

import { performance } from "node:perf_hooks";
import { BootLogGate } from "../../core/utils/boot-log-limit.js";
import pc from "picocolors";
import { importIndexEntry } from "../import-index.js";
import { normalizePath } from "../../core/utils/paths.js";
import { KerithError } from "../../core/errors.js";

import type { BootstrapContext } from "../context.js";

export async function runDynamicImports(ctx: BootstrapContext): Promise<void> {
  const {
    config,
    log,
    registry,
    scanResult,
    resolvedModules,
    usedCache,
    isFullCacheHit,
  } = ctx;

  const rescannedDomains = ctx.rescannedDomains ?? new Set<string>();

  if (!config || !log || !scanResult || !resolvedModules) {
    throw new Error("runDynamicImports requires config, log, scanResult, and resolvedModules in context");
  }

  const isOriginMode = !!config.origin;
  const startTime = performance.now(); // local measurement

  // 6a — Domains in parallel
  const domainLogGate = new BootLogGate(config.logLevel);
  await Promise.all(
    scanResult.domains.map(async (domain) => {
      await importIndexEntry(domain.indexPath, config.rules.moduleLoadTimeout);
      if (domainLogGate.next()) {
        log.info(`Domain loaded: ${pc.cyan(domain.name)}`, {
          _module: "domain",
          name: domain.name,
        });
      }
    }),
  );
  if (domainLogGate.hasOverflow) {
    log.info(
      `... and ${domainLogGate.overflow} more domain(s) loaded (total: ${domainLogGate.total})`,
      { _module: "domain" },
    );
  }

  // 6b — Modules in parallel: import first, correlation and validation after
  const importedModules = await Promise.all(
    resolvedModules.map(async (mod) => {
      const modStart = performance.now();
      const imported = await importIndexEntry(
        mod.indexPath,
        config.rules.moduleLoadTimeout,
      );
      if (process.env.KERITH_PROFILE === "true") {
        log.debug(
          `[perf] import ${mod.name} took ${Math.round(performance.now() - modStart)}ms`,
          { _module: "boot" },
        );
      }
      return { mod, imported };
    }),
  );

  // Correlation and validation (pure CPU — maintains original order)
  const allRegisteredOnce = registry.getAllModules();
  const registeredByPath = new Map(
    allRegisteredOnce.map((m) => [normalizePath(m.path), m]),
  );

  const moduleLogGate = new BootLogGate(config.logLevel);

  for (const { mod, imported } of importedModules) {
    const registeredMod = registeredByPath.get(normalizePath(mod.dirPath));

    if (!registeredMod) {
      if (isOriginMode) {
        // An index.ts without Kerith identifier is silently ignored
        continue;
      } else {
        throw new KerithError(
          "MODULE_NOT_FOUND",
          `No index.ts found calling Module(). Add Module() to the module's index.ts.`,
          `File: ${mod.indexPath}`,
        );
      }
    }

    const isModuleFromCache =
      isFullCacheHit ||
      (usedCache &&
        !rescannedDomains.has(registeredMod.domain || "__flat__"));
    const cacheSuffix = isModuleFromCache ? " (from cache)" : "";

    const moduleLabel = registeredMod.domain
      ? `${pc.dim(registeredMod.domain + "/")}${pc.green(registeredMod.name)}`
      : pc.green(registeredMod.name);

    if (moduleLogGate.next()) {
      log.info(`Module loaded: ${moduleLabel}${cacheSuffix}`, {
        _module: "module",
        name: registeredMod.name,
        domain: registeredMod.domain,
        imports: registeredMod.imports,
        exports: registeredMod.exports,
        path: registeredMod.path,
      });
    }

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

  if (moduleLogGate.hasOverflow) {
    log.info(
      `... and ${moduleLogGate.overflow} more module(s) loaded (total: ${moduleLogGate.total})`,
      { _module: "module" },
    );
  }

  // 6c — Submodules in parallel
  await Promise.all(
    scanResult.submodules.map(async (sub) => {
      await importIndexEntry(sub.indexPath, config.rules.moduleLoadTimeout);
      log.debug(`SubModule loaded: ${sub.name}`, {
        _module: "submodule",
        name: sub.name,
        parentModule: sub.parentModule,
        domain: sub.domain,
      });
    }),
  );

  const importEnd = performance.now();
  const importMs = Math.round(importEnd - startTime);
  log.debug(`[perf] imports=${importMs}ms`, {
    _module: "boot",
  });

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

  // Mutate context
  ctx.allModules = allModules;
}
