/**
 * @file aliases/matcher.ts
 *
 * Pure alias-matcher factory — precomputes three lookup structures so that
 * every `resolve()` call is O(1) or O(k) with k << n, and, crucially,
 * **the resolution order is deterministic regardless of insertion order**:
 *
 *   1. Exact match            – O(1) via Map
 *   2. Wildcard (`alias/*`)   – longest base first
 *   3. Implicit prefix        – longest prefix first (bare alias used as dir)
 *   4. nextResolve pass-through
 *
 * This is the provisional replacement for the inline `for…of` loop that was
 * causing BUG-02 (prefix match winning over exact match).  It will be
 * superseded by the B1 rewrite but is the minimal, testable fix for A1.2.
 *
 * @see SECURITY.md §BUG-02, A1.2
 */

import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ── Types re-exported from resolver so callers need only one import ───────────
export type ResolveContext = { conditions: string[]; parentURL?: string };
export type NextResolveFn = (
  specifier: string,
  context?: ResolveContext
) => { shortCircuit?: boolean; url: string; format?: string | null };

export type ResolveHookFn = (
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolveFn
) => ReturnType<NextResolveFn>;

// ── Internal structures ───────────────────────────────────────────────────────

interface WildcardEntry {
  /** The alias without the trailing `/*`, e.g. `@billing/orders` */
  base: string;
  /** The filesystem target without the trailing `/*` */
  target: string;
}

interface PrefixEntry {
  /** The bare alias with a trailing `/`, e.g. `@billing/` */
  prefix: string;
  /** The filesystem directory target */
  target: string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a pure alias-resolver function from a flat alias map.
 *
 * @param aliases - Combined alias map (`{ '@billing/orders': '/abs/path', ... }`)
 * @returns A `resolve(specifier, context, nextResolve)` function suitable for
 *          use as a Node.js ESM customization hook.
 *
 * @example
 * ```ts
 * const resolve = createAliasMatcher({
 *   '@billing':        '/src/billing',
 *   '@billing/*':      '/src/billing/*',
 *   '@billing/orders': '/src/billing/orders/index.ts',
 * });
 * resolve('@billing/orders', ctx, next); // → /src/billing/orders/index.ts ✓
 * resolve('@billing/foo',    ctx, next); // → /src/billing/foo            ✓
 * ```
 */
export function createAliasMatcher(aliases: Record<string, string>): ResolveHookFn {
  // -- Step 1: Precompute the three structures ---------------------------------

  const exactMap = new Map<string, string>();
  const wildcards: WildcardEntry[] = [];
  const prefixes: PrefixEntry[] = [];

  // Sort entries by alias length descending so that more-specific aliases are
  // processed first when building the arrays (wildcards / prefixes inherit this
  // ordering, which means we iterate longest-first during resolution).
  const sortedEntries = Object.entries(aliases).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [alias, rawTarget] of sortedEntries) {
    // Normalise target: strip trailing `/*` from the filesystem path.
    const target = rawTarget.endsWith('/*') ? rawTarget.slice(0, -2) : rawTarget;

    if (alias.endsWith('/*')) {
      // Wildcard alias: `@billing/*` → base = `@billing`
      wildcards.push({ base: alias.slice(0, -2), target });
    } else {
      // Exact alias: `@billing/orders` or `@billing`
      exactMap.set(alias, target);
      // Also register as an implicit prefix for sub-path resolution:
      // `@billing/orders/detail` → target + `/detail`
      prefixes.push({ prefix: alias + '/', target });
    }
  }

  // -- Step 2: Return the resolver closure ------------------------------------

  return function resolve(
    specifier: string,
    context: ResolveContext,
    nextResolve: NextResolveFn
  ): ReturnType<NextResolveFn> {
    // 1. Exact match — O(1)
    const exactTarget = exactMap.get(specifier);
    if (exactTarget !== undefined) {
      return attemptResolve(
        pathToFileURL(exactTarget).href,
        context,
        nextResolve,
        specifier
      );
    }

    // 2. Wildcard aliases — longest base first
    for (const { base, target } of wildcards) {
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

    // 3. Implicit prefix — longest prefix first
    for (const { prefix, target } of prefixes) {
      if (specifier.startsWith(prefix)) {
        const subPath = specifier.slice(prefix.length);
        const resolvedPath = path.resolve(target, subPath);
        return attemptResolve(
          pathToFileURL(resolvedPath).href,
          context,
          nextResolve,
          prefix.slice(0, -1) // alias without trailing '/'
        );
      }
    }

    // 4. Pass-through
    return attemptResolve(specifier, context, nextResolve);
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function attemptResolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolveFn,
  originalAlias?: string
): ReturnType<NextResolveFn> {
  try {
    return nextResolve(specifier, context);
  } catch (err: any) {
    // Retry with .ts extension when .js was requested (tsx / source-mapped runs)
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.endsWith('.js')) {
      try {
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      } catch {
        // Fallback failed — fall through to original error enrichment
      }
    }

    // Enrich the error with the original alias name for actionable DX
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && originalAlias) {
      let displayPath = specifier;
      if (specifier.startsWith('file://')) {
        try {
          displayPath = fileURLToPath(specifier);
        } catch {
          // ignore conversion errors
        }
      }
      err.message =
        `Cannot resolve alias '${originalAlias}' → ${displayPath} not found. ` +
        `Run: kerith sync-preload\n\nOriginal error:\n${err.message}`;
    }

    throw err;
  }
}
