import { registerHooks } from 'node:module';
import { KerithError } from '../core/errors.js';
import { getAliasRuntime, createAliasNotFoundError } from './runtime.js';

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

export const VIRTUAL_HOOKS_REGISTERED_KEY = Symbol.for('kerith.virtual-hooks-registered');

let virtualHookRegistration: { deregister: () => void } | null = null;

export function isVirtualAliasHookRegistered(): boolean {
  return (
    virtualHookRegistration !== null ||
    (globalThis as any)[VIRTUAL_HOOKS_REGISTERED_KEY] === true
  );
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
    let channelKeyToCatch: string | null = null;

    if (specifier.startsWith('@')) {
      const slashIndex = specifier.indexOf('/');
      if (slashIndex > 1) {
        const prefix = specifier.slice(1, slashIndex);

        if (ALIAS_CHANNEL_PREFIXES.has(prefix)) {
          const rest = specifier.slice(slashIndex + 1);
          const firstSlashInRest = rest.indexOf('/');

          if (firstSlashInRest !== -1) {
            // Subpath detected, e.g. @client/db/something
            const baseName = rest.slice(0, firstSlashInRest);
            const baseKey = `${prefix}/${baseName}`;
            // Only throw ALIAS_INVALID if the base alias exists in the table.
            // If it's not a known channel alias in the table, don't block user aliases (GAP-6).
            if (runtime.table.has(baseKey)) {
              throw new KerithError(
                'ALIAS_INVALID',
                `Subpaths are not supported for channel alias "${specifier}". Alias imports must be in the form "@${prefix}/${baseName}".`,
                `Received: "${specifier}"`,
              );
            }
          } else {
            const key = `${prefix}/${rest}`;
            if (runtime.table.has(key)) {
              return {
                shortCircuit: true,
                url: `kerith-alias:${key}`,
              };
            }
            channelKeyToCatch = key;
          }
        }
      }
    }

    try {
      return nextResolve(specifier, context);
    } catch (err: any) {
      if (
        channelKeyToCatch &&
        (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND')
      ) {
        throw createAliasNotFoundError(channelKeyToCatch, Array.from(runtime.table.keys()));
      }
      throw err;
    }
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
 * If resolveAliases is false, this is a no-op (or deregisters previous registration).
 * If already registered (e.g. by preload.js), this is a no-op unless options.force is true.
 */
export function registerVirtualAliasHooks(
  options: { resolveAliases?: boolean; force?: boolean } = {},
): void {
  if (options.resolveAliases === false) {
    if (virtualHookRegistration) {
      virtualHookRegistration.deregister();
      virtualHookRegistration = null;
    }
    delete (globalThis as any)[VIRTUAL_HOOKS_REGISTERED_KEY];
    return;
  }

  if (typeof registerHooks !== 'function') {
    return;
  }

  // Idempotence: if already registered, createApp (or subsequent calls) does not re-register
  if (!options.force && isVirtualAliasHookRegistered()) {
    return;
  }

  // Deregister previous registration if force re-registering
  if (virtualHookRegistration) {
    virtualHookRegistration.deregister();
    virtualHookRegistration = null;
  }

  const hooks = createVirtualAliasHooks();
  virtualHookRegistration = registerHooks(hooks);
  (globalThis as any)[VIRTUAL_HOOKS_REGISTERED_KEY] = true;
}

/** @internal exclusively for tests */
export function clearVirtualAliasHooks(): void {
  if (virtualHookRegistration) {
    virtualHookRegistration.deregister();
    virtualHookRegistration = null;
  }
  delete (globalThis as any)[VIRTUAL_HOOKS_REGISTERED_KEY];
}

