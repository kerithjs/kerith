// src/infrastructure/_alias-factory.ts
// Internal helper — NOT exported from src/index.ts.
// Each alias-channel identifier is a thin wrapper produced by this factory.

import { getFileCallerInfo } from '@kerith/core';
import { registerAliasPlugin } from '../channels/index.js';

/**
 * Options accepted by alias-channel identifiers (Client, Config, Provider, Store, Adapter).
 * Stored for future use by the @kerith/app executor — not acted upon inside @kerith/identifiers.
 */
export interface AliasIdentifierOptions {
  /**
   * If true, the factory is not called at register time — it is called lazily on first access.
   * @default false
   */
  lazy?: boolean;
  /**
   * Maximum milliseconds to wait for the factory to resolve (applies to async factories).
   * Consumed by the @kerith/app executor, not by this package.
   */
  timeout?: number;
  /**
   * If true, bootstrap fails when this alias cannot be resolved.
   * @default true
   */
  required?: boolean;
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
    _options: AliasIdentifierOptions = {},
  ): void {
    const { filePath } = getFileCallerInfo(`${publicName}()`);
    registerAliasPlugin({
      prefix,
      name,
      filePath,
      resolve: factory,
    });
  };
}
