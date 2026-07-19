// src/infrastructure/config.ts
import { createAliasIdentifier } from './_alias-factory.js';

/**
 * Registers a named configuration object as a resolvable alias `@config/{name}`.
 *
 * @example
 * ```ts
 * import { Config } from '@kerith/identifiers';
 *
 * Config('database', () => ({
 *   host: process.env.DB_HOST ?? 'localhost',
 *   port: Number(process.env.DB_PORT ?? 5432),
 * }));
 * // Resolvable elsewhere as: import dbConfig from '@config/database';
 * ```
 */
export const Config = createAliasIdentifier('config', 'Config');
