/**
 * @file bootstrap/steps/step-05b-virtual-aliases.ts
 *
 * Step 05b — Virtual Alias Hooks Registration
 *
 * This step registers Node.js ESM customization hooks (`resolve` + `load`)
 * for the virtual alias channel (@config, @client, @store, @provider, @adapter).
 *
 * It must run strictly after step 05 (physical alias activation) to ensure
 * virtual alias hooks maintain top LIFO precedence, and strictly before
 * step 06 (dynamic imports) so modules can import alias channel instances.
 */

import { registerVirtualAliasHooks } from "../../aliases/virtual-hooks.js";
import type { BootstrapContext } from "../context.js";

/**
 * Registers virtual alias hooks in the ESM loader.
 */
export async function runVirtualAliases(ctx: BootstrapContext): Promise<void> {
  registerVirtualAliasHooks({ resolveAliases: ctx.config?.resolveAliases });
}

