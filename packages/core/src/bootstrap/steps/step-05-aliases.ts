/**
 * @file bootstrap/steps/step-05-aliases.ts
 *
 * Step 05 — Alias Activation
 *
 * This step registers all dynamically discovered aliases (from domains,
 * modules, and shared roots) into the Kerith registry, and then activates
 * the ESM import hook (`activateAliasResolver`) so that dynamic imports
 * executed in subsequent steps can correctly resolve them.
 *
 * It must run strictly after entity registration (step 03) and NITS
 * reconciliation (step 04) so that all paths are known, but strictly before
 * dynamic imports (step 06).
 */

import path from "node:path";
import { activateAliasResolver } from "../../aliases/resolver.js";
import { updateAliasCache } from "../../aliases/cache.js";
import type { BootstrapContext } from "../context.js";

/**
 * Executes the alias activation phase of the bootstrap pipeline.
 *
 * @param ctx - The shared bootstrap context containing config, log, registry, and resolved modules.
 */
export async function runAliasActivation(ctx: BootstrapContext): Promise<void> {
  // If alias resolution is disabled in config, skip entirely.
  if (ctx.config?.resolveAliases === false) {
    return;
  }

  // Ensure required context variables exist.
  // config and log are guaranteed to be defined at this point by step-01,
  // resolvedModules by step-02.
  const { config, log, registry, resolvedModules, cwd } = ctx;
  if (!config || !resolvedModules || !log) return;

  const pureModuleAliases: Record<string, string> = {};

  for (const domain of registry.getAllDomains()) {
    const domainAlias = `@${domain.name}`;
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
  const globalShared = registry.getShared("@shared");
  if (globalShared) {
    pureModuleAliases["@shared"] = globalShared.path;
    pureModuleAliases["@shared/*"] = `${globalShared.path}/*`;
  }

  // Domain-scoped shared
  for (const entry of registry
    .getAllShared()
    .filter((e) => e.type === "domain-scoped")) {
    pureModuleAliases[entry.alias] = entry.path;
    pureModuleAliases[`${entry.alias}/*`] = `${entry.path}/*`;
  }

  const normalizedConfigAliases: Record<string, string> = {};
  for (const [alias, absPath] of config.resolvedAliases) {
    registry.registerAlias(alias, absPath);
    normalizedConfigAliases[alias] = absPath;
    if (log) {
      log.debug(`Alias registered: ${alias} → ${absPath}`, {
        alias,
        finalTargetPath: absPath,
        source: "config",
        _module: "alias",
      });
    }
  }

  // Registrar @modules como alias built-in
  if (config.modules) {
    const modulesDir = config.modules.replace(/\/\*$/, "");
    registry.registerAlias("@modules", path.resolve(cwd, modulesDir));
  } else if (config.origin) {
    registry.registerAlias("@modules", path.resolve(cwd, config.origin));
  }

  await activateAliasResolver(pureModuleAliases, normalizedConfigAliases, log);
  updateAliasCache(registry.getAllAliases());
}
