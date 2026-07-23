/**
 * @file bootstrap/steps/step-07-validations.ts
 *
 * Step 07 — Validate Dependencies
 *
 * This step performs static analysis when `config.strict` is true.
 * It checks that:
 * 1. Modules declared in `imports[]` actually exist.
 * 2. Shared declarations and aliases are valid.
 * 3. Files inside a module only import from modules declared in `imports[]`.
 * 4. Modules declared in `imports[]` are actually used in code.
 * 5. There are no circular dependencies.
 *
 * It mutates `ctx.modulePathMap` and `ctx.sortedModulePaths` to cache lookups
 * for step-08.
 */

import path from "node:path";
import { KerithError } from "../../core/errors.js";
import { extractModuleImportsAsync } from "../../nits/import-scanner.js";
import { normalizePath, groupFilesByModulePath } from "../../core/utils/paths.js";
import { buildModuleKey } from "../../core/registry.js";
import {
  getRegisteredAliasProviders,
  getRegisteredMiddlewareResolvers,
  getRegisteredScheduleProviders,
  getRegisteredBindingProviders,
} from "../../extension/store.js";
import type { BootstrapContext } from "../context.js";

export async function runValidations(ctx: BootstrapContext): Promise<void> {
  const { config, log, registry, allModules, allProjectFiles } = ctx;

  if (!config || !log || !allModules || !allProjectFiles) {
    throw new Error("runValidations requires config, log, allModules, and allProjectFiles in context");
  }

  // Generate lookup structures needed for validations and step-08
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

  // Step 7.0 — Validate missing imports
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
      const error = (
        code: import("../../core/errors.js").KerithErrorCode,
        message: string,
        details: string,
      ) => {
        if (config.strict) {
          throw new KerithError(code, message, details);
        } else {
          log.warn(message, { _module: "bootstrap", code, details });
        }
      };

      // Check if it's a Kerith module alias (should be in imports[], not shared[])
      if (registry.hasModule(sharedAlias, mod.domain)) {
        error(
          "MODULE_IN_SHARED",
          `Module "${mod.name}" declares "${sharedAlias}" in shared[] but it is a Kerith module alias.`,
          `Move "${sharedAlias}" from shared[] to imports[] in Module() for "${mod.name}".`,
        );
        continue;
      }

      // Check if it's '@shared' or a subpath of '@shared'
      const isSharedOrSubpath =
        sharedAlias === "@shared" || sharedAlias.startsWith("@shared/");
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

    const groupedSourceFiles = groupFilesByModulePath(
      allSourceFiles,
      sortedModulePaths,
    );
    for (const [modPath, files] of groupedSourceFiles) {
      const modRef = modulePathMap.get(modPath);
      if (modRef) {
        const key = buildModuleKey(modRef.name, modRef.domain);
        filesByModule.get(key)?.push(...files);
      }
    }

    for (const registeredMod of allModules) {
      const rawMod = registry.getRawModule(
        registeredMod.name,
        registeredMod.domain,
      );
      if (!rawMod) continue;

      const sourceFiles =
        filesByModule.get(
          buildModuleKey(registeredMod.name, registeredMod.domain),
        ) ?? [];
      const usedImports = new Set<string>();
      const registeredAliases = registry.getRegisteredAliases();

      const allActualImports = await Promise.all(
        sourceFiles.map(async (file) => {
          const actualImports = await extractModuleImportsAsync(
            file,
            registeredAliases,
          );
          return { file, actualImports };
        })
      );

      for (const { file, actualImports } of allActualImports) {
        for (const imp of actualImports) {
          const parts = imp.specifier.split("/");
          const targetModule = imp.specifier.startsWith("@modules/")
            ? parts[1]
            : (parts[1] || parts[0]).replace(/^@/, "");
          if (!targetModule || targetModule === registeredMod.name) continue;

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
      const cycleStrings = cycles.map((cycle) => cycle.join(" -> ")).join(" | ");
      throw new KerithError(
        "CIRCULAR_DEPENDENCY",
        `Circular dependency detected. Extract the shared dependency into a separate module.`,
        `Cycles found: ${cycleStrings}`,
      );
    }
  }

  // Step 7.6 — Validate Duplicate Identifiers (Alias, Middleware, Schedule, Binding)
  const validateUniqueIdentifiers = (
    providers: { name: string; filePath?: string; prefix?: string }[],
    duplicateSameModuleCode: import("../../core/errors.js").KerithErrorCode,
    identifierType: string
  ) => {
    // Map to group by name (or prefix/name for Alias)
    const seen = new Map<string, { moduleId: string; filePath: string }>();

    for (const provider of providers) {
      if (!provider.name || !provider.filePath) continue;

      let moduleId = "unknown";
      const normalizedFilePath = normalizePath(provider.filePath);
      
      for (const modPath of sortedModulePaths) {
        if (normalizedFilePath === modPath || normalizedFilePath.startsWith(modPath + "/")) {
          const modRef = modulePathMap.get(modPath);
          if (modRef) {
            moduleId = buildModuleKey(modRef.name, modRef.domain);
          }
          break;
        }
      }

      const uniqueKey = provider.prefix ? `${provider.prefix}/${provider.name}` : provider.name;
      
      if (seen.has(uniqueKey)) {
        const existing = seen.get(uniqueKey)!;
        
        if (existing.moduleId === moduleId) {
          throw new KerithError(
            duplicateSameModuleCode,
            `duplicate ${identifierType} "${uniqueKey}" inside the same module "${moduleId}"`,
            `Conflicts between ${existing.filePath} and ${provider.filePath}`
          );
        } else {
          throw new KerithError(
            "DUPLICATE_EXTENSION_PROVIDER",
            `duplicate ${identifierType} "${uniqueKey}" across different modules`,
            `Conflicts between ${existing.filePath} (${existing.moduleId}) and ${provider.filePath} (${moduleId})`
          );
        }
      }
      
      seen.set(uniqueKey, { moduleId, filePath: provider.filePath });
    }
  };

  validateUniqueIdentifiers(getRegisteredAliasProviders(), "DUPLICATE_ALIAS_IDENTIFIER", "AliasProvider");
  // Filter out any resolvers without a name (e.g., manually registered internal ones if any)
  validateUniqueIdentifiers(getRegisteredMiddlewareResolvers().filter(r => r.name), "DUPLICATE_MIDDLEWARE_IDENTIFIER", "MiddlewareResolver");
  validateUniqueIdentifiers(getRegisteredScheduleProviders(), "DUPLICATE_SCHEDULE_IDENTIFIER", "ScheduleProvider");
  validateUniqueIdentifiers(getRegisteredBindingProviders(), "DUPLICATE_BINDING_IDENTIFIER", "BindingProvider");

  // Mutate context
  ctx.modulePathMap = modulePathMap;
  ctx.sortedModulePaths = sortedModulePaths;
}
