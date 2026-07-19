// src/infrastructure/client.ts
import { createAliasIdentifier } from './_alias-factory.js';

/**
 * Registers a named client instance (HTTP client, DB driver, SDK, etc.)
 * as a resolvable alias `@client/{name}`.
 *
 * @example
 * ```ts
 * import { Client } from '@kerith/identifiers';
 * import { createClient } from 'redis';
 *
 * Client('redis', () => createClient({ url: process.env.REDIS_URL }));
 * // Resolvable elsewhere as: import redis from '@client/redis';
 * ```
 */
export const Client = createAliasIdentifier('client', 'Client');
