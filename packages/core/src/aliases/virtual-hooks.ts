import { registerHooks } from 'node:module';
import { KerithError } from '../core/errors.js';
import { getAliasRuntime } from './runtime.js';

export const ALIAS_CHANNEL_PREFIXES = new Set([
  'config',
  'client',
  'store',
  'provider',
  'adapter',
]);

export type LoadHookContext = {
  conditions: string[];
  format?: string | null;
  importAttributes?: Record<string, string>;
};

export type NextLoad = (
  url: string,
  context?: LoadHookContext
) => { shortCircuit?: boolean; format: string; source: string | ArrayBuffer | Uint8Array };

let virtualHookRegistration: { deregister: () => void } | null = null;

export function isVirtualAliasHookRegistered(): boolean {
  return virtualHookRegistration !== null;
}

/**
 * Creates the resolve and load hooks for virtual alias resolution.
 */
export function createVirtualAliasHooks() {
  const runtime = getAliasRuntime();

  function resolve(
    specifier: string,
    context: any,
    nextResolve: (s: string, c?: any) => any,
  ) {
    if (specifier.startsWith('@')) {
      const slashIndex = specifier.indexOf('/');
      if (slashIndex > 1) {
        const prefix = specifier.slice(1, slashIndex);

        if (ALIAS_CHANNEL_PREFIXES.has(prefix)) {
          const rest = specifier.slice(slashIndex + 1);
          // Check for subpaths: e.g. @client/db/sub -> invalid
          if (rest.includes('/')) {
            throw new KerithError(
              'ALIAS_INVALID',
              `Subpaths are not supported for channel alias "${specifier}". Alias imports must be in the form "@${prefix}/{name}".`,
              `Received: "${specifier}"`,
            );
          }

          const key = `${prefix}/${rest}`;
          if (runtime.table.has(key)) {
            return {
              shortCircuit: true,
              url: `kerith-alias:${key}`,
            };
          }
        }
      }
    }

    return nextResolve(specifier, context);
  }

  function load(
    url: string,
    context: any,
    nextLoad: (u: string, c?: any) => any,
  ) {
    if (url.startsWith('kerith-alias:')) {
      const key = url.slice('kerith-alias:'.length);
      const safeKey = JSON.stringify(key);

      return {
        shortCircuit: true,
        format: 'module',
        source: `export default await globalThis[Symbol.for('kerith.alias-runtime')].get(${safeKey});`,
      };
    }

    return nextLoad(url, context);
  }

  return { resolve, load };
}

/**
 * Registers the virtual alias hooks idempotently.
 *
 * If resolveAliases is false, this is a no-op.
 * Re-registering deregisters any previous registration to ensure LIFO precedence.
 */
export function registerVirtualAliasHooks(options: { resolveAliases?: boolean } = {}): void {
  if (options.resolveAliases === false) {
    if (virtualHookRegistration) {
      virtualHookRegistration.deregister();
      virtualHookRegistration = null;
    }
    return;
  }

  if (typeof registerHooks !== 'function') {
    return;
  }

  // Deregister previous registration if exists so the new one takes LIFO front position
  if (virtualHookRegistration) {
    virtualHookRegistration.deregister();
    virtualHookRegistration = null;
  }

  const hooks = createVirtualAliasHooks();
  virtualHookRegistration = registerHooks(hooks);
}

/** @internal exclusively for tests */
export function clearVirtualAliasHooks(): void {
  if (virtualHookRegistration) {
    virtualHookRegistration.deregister();
    virtualHookRegistration = null;
  }
}
