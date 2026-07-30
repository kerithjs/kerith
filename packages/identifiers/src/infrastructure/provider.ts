// src/infrastructure/provider.ts
import { createAliasIdentifier } from './_alias-factory.js';

/**
 * Registers a named provider (service provider, IoC binding, etc.)
 * as a resolvable alias `@provider/{name}`.
 *
 * @example
 * ```ts
 * import { Provider } from '@kerith/identifiers';
 * import { EmailService } from './email.service.js';
 *
 * Provider('email', () => new EmailService());
 * // Resolvable elsewhere as: import email from '@provider/email';
 * ```
 */
export const Provider = createAliasIdentifier('provider', 'Provider');
