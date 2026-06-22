/**
 * @file bootstrap/steps/step-03-register.ts
 *
 * Step 03 — Entity Registration & File Prefetch
 *
 * Seeding the `InternalRegistry` with the initial entities discovered by the
 * scanner (Domains, Submodules, Shared roots).
 * It also prefetches the entire project filesystem using a single global `fast-glob`
 * call. This `allProjectFiles` array is placed in the context and reused by
 * downstream steps (NITS, Controller discovery) to avoid redundant I/O.
 */

import path from "node:path";
import fg from "fast-glob";
import { registerEntitiesFromScan } from "../register-from-scan.js";
import { normalizePath } from "../../core/utils/paths.js";
import type { BootstrapContext } from "../context.js";

/**
 * Registers scan entities and prefetches the project filesystem.
 *
 * @param ctx - The shared bootstrap context.
 */
export async function runEntityRegistration(ctx: BootstrapContext): Promise<void> {
  const { config, log, registry, scanResult, resolvedModules, cwd } = ctx;

  if (!config || !log || !scanResult || !resolvedModules) {
    throw new Error("runEntityRegistration requires config, log, scanResult, and resolvedModules in context");
  }

  // 1. Seed the registry
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

  // 2. Pre-fetch all project files to avoid multiple glob calls later
  let modulesRoot = "";
  if (config.origin) {
    modulesRoot = config.origin;
  } else if (config.modules) {
    modulesRoot = config.modules.split("*")[0].replace(/\/$/, "");
  }
  const absoluteModulesRoot = modulesRoot
    ? normalizePath(path.resolve(cwd, modulesRoot))
    : "";

  let allProjectFiles: string[] = [];
  if (absoluteModulesRoot) {
    allProjectFiles = await fg(
      `${absoluteModulesRoot}/**/*.{ts,js,mts,mjs,cjs}`,
      {
        absolute: true,
        cwd,
        ignore: [
          "**/*.test.*",
          "**/*.spec.*",
          "**/*.d.ts",
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
        ],
      },
    );
  }

  // Mutate context
  ctx.allProjectFiles = allProjectFiles;
  ctx.absoluteModulesRoot = absoluteModulesRoot;
}
