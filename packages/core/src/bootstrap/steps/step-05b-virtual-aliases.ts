/**
 * @file bootstrap/steps/step-05b-virtual-aliases.ts
 *
 * Step 05b — Virtual Alias Hooks Registration + Static Table Population
 *
 * This step:
 *   1. Runs static alias discovery (`scanAliasDeclarations`) under `origin`
 *      and populates `runtime.table` with the resulting `key → filePath` map.
 *      This eliminates the Level-1 limitation that required the declaring file
 *      to have been imported before the alias was accessible.
 *   2. Registers Node.js ESM customization hooks (`resolve` + `load`) for the
 *      virtual alias channel (@config, @client, @store, @provider, @adapter).
 *
 * Step 05b must run strictly after step 05 (physical alias activation) to ensure
 * virtual alias hooks maintain top LIFO precedence, and strictly before
 * step 06 (dynamic imports) so modules can import alias channel instances.
 */

import path from "node:path";
import { registerVirtualAliasHooks } from "../../aliases/virtual-hooks.js";
import { getAliasRuntime } from "../../aliases/runtime.js";
import { scanAliasDeclarations } from "../alias-scan.js";
import type { BootstrapContext } from "../context.js";

/**
 * Registers virtual alias hooks in the ESM loader and populates the static alias table.
 */
export async function runVirtualAliases(ctx: BootstrapContext): Promise<void> {
  // ── Static table population (Fase 3 / 7.1) ─────────────────────────────────
  // Discover alias declarations statically so the ESM hook can resolve
  // @prefix/name imports even before the declaring file has been evaluated.
  if (ctx.config?.resolveAliases !== false && ctx.cwd) {
    const originPath = ctx.config?.origin
      ? path.resolve(ctx.cwd, ctx.config.origin)
      : path.resolve(ctx.cwd, 'src');

    try {
      const scan = await scanAliasDeclarations({
        originPath,
        warn: ctx.log
          ? (msg) => ctx.log!.warn(msg, { _module: 'alias' })
          : undefined,
      });
      if (scan.table.size > 0) {
        getAliasRuntime().setTable(scan.table);
      }
    } catch (err: any) {
      // Errors that indicate broken app design abort bootstrap (design contract).
      if (
        err?.code === 'ALIAS_CIRCULAR' ||
        err?.code === 'DUPLICATE_ALIAS_IDENTIFIER' ||
        err?.code === 'DUPLICATE_EXTENSION_PROVIDER' ||
        err?.code === 'ALIAS_INVALID'
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      (ctx.log?.warn ?? console.warn)(`[alias-scan] Static alias scan failed: ${msg}`);
    }
  }

  // ── Virtual alias hooks registration ────────────────────────────────────────
  registerVirtualAliasHooks({ resolveAliases: ctx.config?.resolveAliases });
}

