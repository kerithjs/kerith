// src/infrastructure/_alias-factory.ts
// Internal helper — NOT exported from src/index.ts.
// Each alias-channel identifier is a thin wrapper produced by this factory.

import { getFileCallerInfo, getAliasRuntime } from '@kerith/core';
import { registerAliasPlugin } from '../channels/index.js';

/**
 * Options accepted by alias-channel identifiers (Client, Config, Provider, Store, Adapter).
 * Validated by the alias runtime when the identifier is declared.
 */
export interface AliasIdentifierOptions {
  /**
   * When `false` (the default), the factory is resolved eagerly during the
   * bootstrap (Step 06b). When `true`, it is skipped at bootstrap and resolved
   * on first import/access — including a top-level import during module
   * evaluation.
   * @default false
   */
  lazy?: boolean;
  /**
   * Maximum milliseconds to wait for the factory to resolve (applies to async factories).
   * `0` disables the timeout. Consumed by the alias runtime.
   * @default 30000
   */
  timeout?: number;
  /**
   * If true, bootstrap fails when this alias cannot be resolved.
   * When false, resolution failures are logged once and `undefined` is memoized.
   * @default true
   */
  required?: boolean;
  /**
   * Optional cleanup function invoked once per resolved instance during
   * graceful shutdown (`disposeAll()`). Aliases are disposed in reverse
   * resolution order (LIFO) with a 5000 ms budget each; errors are logged and
   * do not stop the remaining disposals. Never called for aliases that did not
   * resolve an instance (lazy and never imported, or failed).
   */
  dispose?: (instance: unknown) => void | Promise<void>;
  [key: string]: unknown;
}

/**
 * Returns the public identifier function for an alias-channel identifier.
 *
 * The returned function is what the user calls directly in their source files.
 * `getFileCallerInfo()` is invoked inside it — one level below the user call —
 * so the stack depth is correct: `[user file] → [identifier fn] → getFileCallerInfo`.
 *
 * @param prefix     Alias prefix, e.g. `'client'` → `@client/{name}`.
 * @param publicName Human-readable name used in error messages, e.g. `'Client'`.
 */
export function createAliasIdentifier(
  prefix: string,
  publicName: string,
): (name: string, factory: () => unknown, options?: AliasIdentifierOptions) => void {
  return function (
    name: string,
    factory: () => unknown,
    options: AliasIdentifierOptions = {},
  ): void {
    const { filePath } = getFileCallerInfo(`${publicName}()`);

    // 1. Direct registration in the core AliasRuntime singleton. This is the
    //    validating step: invalid options throw `ALIAS_INVALID` here. Do it
    //    before touching the compatibility plugin store so a rejected
    //    declaration doesn't leave a half-registered plugin behind.
    getAliasRuntime().declare({
      prefix,
      name,
      filePath,
      factory,
      options: { ...options },
    });

    // 2. Compatibility with existing @kerith/app channel pipeline
    registerAliasPlugin({
      prefix,
      name,
      filePath,
      resolve: factory,
      options: { ...options },
    });
  };
}
