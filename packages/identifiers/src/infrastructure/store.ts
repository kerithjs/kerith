// src/infrastructure/store.ts
import { createAliasIdentifier } from './_alias-factory.js';

/**
 * Registers a named state store (Redux, Zustand, in-memory cache, etc.)
 * as a resolvable alias `@store/{name}`.
 *
 * @example
 * ```ts
 * import { Store } from '@kerith/identifiers';
 * import { createStore } from './session-store.js';
 *
 * Store('session', () => createStore());
 * // Resolvable elsewhere as: import sessionStore from '@store/session';
 * ```
 */
export const Store = createAliasIdentifier('store', 'Store');
