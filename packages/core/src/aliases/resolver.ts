import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import type { Logger } from '../types/index.js';

// Node.js Customization Hooks types
export type ResolveHookContext = {
  conditions: string[];
  parentURL?: string;
};

export type NextResolve = (specifier: string, context?: ResolveHookContext) => { shortCircuit?: boolean; url: string; format?: string | null };

export type ResolveHook = (
  specifier: string,
  context: ResolveHookContext,
  nextResolve: NextResolve
) => ReturnType<NextResolve>;

let activeHookRegistration: { deregister: () => void } | null = null;
let activeAliasesHash: string | null = null;

/** @internal exclusively for tests */
export function clearAliasResolverOptions(): void {
  if (activeHookRegistration) {
    activeHookRegistration.deregister();
    activeHookRegistration = null;
  }
  activeAliasesHash = null;
}

function mergeAliasesIntoPreloadConfig(aliases: Record<string, string>): void {
  if (globalThis.__KERITH_PRELOAD_CONFIG__) {
    globalThis.__KERITH_PRELOAD_CONFIG__.aliases = {
      ...globalThis.__KERITH_PRELOAD_CONFIG__.aliases,
      ...aliases
    };
  }
}

/**
 * Activates the runtime ESM alias resolver hook.
 * 
 * This hook handles:
 * 1. **Exact aliases**: e.g. `@config` -> `/abs/path/config.ts`.
 * 2. **Directory subpaths**: e.g. `@shared/utils` -> `/abs/path/shared/utils` (if `@shared` points to a directory).
 * 3. **Classic wildcards**: e.g. `@modules/*` -> `/abs/path/modules/*`.
 * 
 * User-defined aliases take precedence over auto-generated module aliases.
 * 
 * Limitation: This ESM hook is strictly for Node ESM pipelines (Node >= 24).
 * For CJS and bundlers (Vite, esbuild), use getAliases() to configure their specific resolvers.
 * 
 * @param moduleAliases  - Auto-generated aliases starting with @modules/
 * @param folderAliases  - Custom user-defined aliases from config
 * @param log            - Logger instance
 * @returns Promise that resolves when the hook is registered
 */
export async function activateAliasResolver(moduleAliases: Record<string, string>, folderAliases: Record<string, string>, log: Logger): Promise<void> {
  // Normalize paths before merging and hashing to ensure absolute paths are used in the loader
  const normalizedModuleAliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(moduleAliases)) {
    normalizedModuleAliases[alias] = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  }

  const normalizedFolderAliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(folderAliases)) {
    normalizedFolderAliases[alias] = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  }

  const combinedAliases = { ...normalizedModuleAliases, ...normalizedFolderAliases };
  const serialisedAliases = JSON.stringify(combinedAliases);

  if (globalThis.__KERITH_PRELOAD_CONFIG__?.preloaded === true) {
    mergeAliasesIntoPreloadConfig(combinedAliases);
    log.debug(`ESM alias hook skipped (handled by pre-loader), merged ${Object.keys(combinedAliases).length} alias(es) into runtime config`, {
      _module: 'alias',
      aliasCount: Object.keys(combinedAliases).length,
    });
    return;
  }

  if (activeAliasesHash === serialisedAliases) return;

  try {
    if (activeHookRegistration) {
      activeHookRegistration.deregister();
      activeHookRegistration = null;
    }
    
    activeAliasesHash = serialisedAliases;

    if (Object.keys(combinedAliases).length === 0) {
      log.debug('No aliases to register, skipping ESM hook activation');
      return;
    }

    for (const [alias, target] of Object.entries(normalizedFolderAliases)) {
      log.debug(`Alias registered: ${alias} → ${target}`, { alias, target, source: 'config' });
    }
    for (const [alias, target] of Object.entries(normalizedModuleAliases)) {
      log.debug(`Alias registered: ${alias} → ${target}`, { alias, target, source: 'module' });
    }

    if (typeof registerHooks === 'function') {
      activeHookRegistration = registerHooks({
        resolve(specifier: string, context: ResolveHookContext, nextResolve: NextResolve) {
          for (const [alias, target] of Object.entries(combinedAliases)) {
            if (alias.endsWith('/*')) {
              const baseAlias = alias.slice(0, -2);
              if (specifier === baseAlias || specifier.startsWith(baseAlias + '/')) {
                const baseTarget = target.endsWith('/*') ? target.slice(0, -2) : target;
                const subPath = specifier.slice(baseAlias.length);
                const resolvedPath = path.resolve(baseTarget, subPath.startsWith('/') ? subPath.slice(1) : subPath);
                return nextResolve(pathToFileURL(resolvedPath).href, context);
              }
            } else if (specifier === alias) {
              const exactTarget = target.endsWith('/*') ? target.slice(0, -2) : target;
              return nextResolve(pathToFileURL(exactTarget).href, context);
            } else if (specifier.startsWith(alias + '/')) {
              const baseTarget = target.endsWith('/*') ? target.slice(0, -2) : target;
              const subPath = specifier.slice(alias.length + 1);
              const resolvedPath = path.resolve(baseTarget, subPath);
              return nextResolve(pathToFileURL(resolvedPath).href, context);
            }
          }
          return nextResolve(specifier, context);
        }
      });
      log.info(`ESM alias hook activated (${Object.keys(combinedAliases).length} alias(es))`, {
        _module: 'alias',
        aliasCount: Object.keys(combinedAliases).length,
      });
    } else {
      log.warn('ESM alias hook could not be registered — upgrade to Node.js >= 24 for runtime alias support', {
        nodeVersion: process.version
      });
      activeAliasesHash = null;
    }
  } catch (err) {
    activeAliasesHash = null;
    log.warn('ESM alias hook registration threw an unexpected error', {
      error: (err as any)?.message ?? String(err)
    });
  }
}
