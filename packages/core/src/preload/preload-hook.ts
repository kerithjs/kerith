import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ResolveHookContext, NextResolve } from '../aliases/resolver.js';

/**
 * Creates a resolve hook with precomputed alias structures.
 * This function is called at the top-level of the generated preload.js file.
 */
export function createResolveHook(aliases: Record<string, string>) {
  // Precompute structures once at creation time
  const exactAliasMap: Map<string, string> = new Map();
  const wildcardAliases: Array<{ base: string; target: string }> = [];
  const prefixAliases: Array<{ prefix: string; target: string }> = [];

  // Sort aliases by descending length (most specific first)
  const sortedEntries = Object.entries(aliases)
    .sort(([a], [b]) => b.length - a.length);

  for (const [alias, target] of sortedEntries) {
    if (alias.endsWith('/*')) {
      // @modules/* -> wildcard
      wildcardAliases.push({
        base: alias.slice(0, -2),
        target: target.endsWith('/*') ? target.slice(0, -2) : target
      });
    } else {
      // @config -> exact match
      exactAliasMap.set(alias, target);
      // @shared -> can also have subpaths (@shared/utils)
      prefixAliases.push({
        prefix: alias + '/',
        target: target.endsWith('/*') ? target.slice(0, -2) : target
      });
    }
  }

  // Return the resolve hook function with closure over precomputed structures
  return function resolve(
    specifier: string,
    context: ResolveHookContext,
    nextResolve: NextResolve
  ) {
    // 1. Exact match — O(1)
    const exactTarget = exactAliasMap.get(specifier);
    if (exactTarget) {
      return attemptResolve(
        pathToFileURL(exactTarget).href,
        context,
        nextResolve,
        specifier
      );
    }

    // 2. Wildcard aliases — @modules/* — O(k) where k = number of wildcards (small)
    for (const { base, target } of wildcardAliases) {
      if (specifier === base || specifier.startsWith(base + '/')) {
        const subPath = specifier.slice(base.length);
        const resolvedPath = path.resolve(
          target,
          subPath.startsWith('/') ? subPath.slice(1) : subPath
        );
        return attemptResolve(
          pathToFileURL(resolvedPath).href,
          context,
          nextResolve,
          base + '/*'
        );
      }
    }

    // 3. Prefix aliases — @shared/utils — O(k) where k = number of exact aliases
    for (const { prefix, target } of prefixAliases) {
      if (specifier.startsWith(prefix)) {
        const subPath = specifier.slice(prefix.length);
        const resolvedPath = path.resolve(target, subPath);
        return attemptResolve(
          pathToFileURL(resolvedPath).href,
          context,
          nextResolve,
          prefix.slice(0, -1) // alias without the trailing '/'
        );
      }
    }

    return attemptResolve(specifier, context, nextResolve);
  };
}

function attemptResolve(specifier: string, context: ResolveHookContext, nextResolve: NextResolve, originalAlias?: string) {
  try {
    return nextResolve(specifier, context);
  } catch (err: any) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.endsWith('.js')) {
      try {
        const tsSpecifier = specifier.slice(0, -3) + '.ts';
        return nextResolve(tsSpecifier, context);
      } catch {
        // Fallback failed, throw original error
      }
    }
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && originalAlias) {
      let displayPath = specifier;
      if (specifier.startsWith('file://')) {
        try {
          displayPath = fileURLToPath(specifier);
        } catch {
          // ignore
        }
      }
      err.message = `Cannot resolve alias '${originalAlias}' → ${displayPath} not found. Run: kerith sync-preload\n\nOriginal error:\n${err.message}`;
    }
    throw err;
  }
}
