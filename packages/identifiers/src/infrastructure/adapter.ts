// src/infrastructure/adapter.ts
import { createAliasIdentifier } from './_alias-factory.js';

/**
 * Registers a named adapter (external system integration, port/adapter pattern)
 * as a resolvable alias `@adapter/{name}`.
 *
 * Note: per the developer guide, `Adapter()` is typically called without options —
 * the third argument is accepted but optional, consistent with the other alias identifiers.
 *
 * @example
 * ```ts
 * import { Adapter } from '@kerith/identifiers';
 * import { StripeAdapter } from './stripe.adapter.js';
 *
 * Adapter('payments', () => new StripeAdapter());
 * // Resolvable elsewhere as: import payments from '@adapter/payments';
 * ```
 */
export const Adapter = createAliasIdentifier('adapter', 'Adapter');
