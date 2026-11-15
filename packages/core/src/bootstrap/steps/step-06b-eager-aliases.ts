/**
 * @file bootstrap/steps/step-06b-eager-aliases.ts
 *
 * Step 06b — Eager Alias Resolution
 *
 * Resolves all alias-channel declarations whose `lazy` option is `false`
 * (the default) in parallel, using `Promise.all`. This step runs strictly
 * after step 06 (dynamic imports), so every module file has already been
 * evaluated and its `Config()`, `Client()`, etc. calls have registered
 * declarations into the AliasRuntime.
 *
 * **Why no topological sort?**
 * Dependencies between factories are expressed via dynamic imports inside
 * each factory body. Node.js resolves those through the ESM graph (virtual
 * alias hooks) — there is nothing to sort at the bootstrap level.
 *
 * **`lazy: true` aliases**
 * They are skipped here entirely. If a module file imports a lazy alias at
 * top-level during step 06, the ESM virtual-alias hook resolves it on demand
 * at that point. The bootstrap does not eagerly touch lazy aliases.
 *
 * **Failure policy**
 * A `required: true` alias (the default) that fails propagates immediately
 * via `Promise.all`, aborting the bootstrap. A `required: false` alias that
 * fails produces a single `console.warn` and memoizes `undefined` (handled
 * inside `AliasRuntime.get()`).
 */

import { performance } from "node:perf_hooks";
import { getAliasRuntime } from "../../aliases/runtime.js";
import type { BootstrapContext } from "../context.js";

/**
 * Resolves all non-lazy alias declarations in parallel.
 * Aborts bootstrap (throws) if any required alias fails.
 */
export async function runEagerAliases(ctx: BootstrapContext): Promise<void> {
  if (ctx.config?.resolveAliases === false) {
    // Alias channel is disabled; nothing to resolve.
    return;
  }

  const { log } = ctx;
  const runtime = getAliasRuntime();

  // Collect only non-lazy declarations.
  const eagerDeclarations = Array.from(runtime.declarations.values()).filter(
    (decl) => decl.options.lazy !== true,
  );

  if (eagerDeclarations.length === 0) {
    return;
  }

  // Resolve all eager aliases in parallel.
  await Promise.all(
    eagerDeclarations.map(async (decl) => {
      const start = performance.now();
      await runtime.get(decl.key);
      if (process.env.KERITH_PROFILE === "true" && log) {
        log.debug(
          `[perf] alias @${decl.prefix}/${decl.name} took ${Math.round(performance.now() - start)}ms`,
          { _module: "boot" },
        );
      }
    }),
  );
}

