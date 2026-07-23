import { KerithError } from '../core/errors.js';
import {
  addAliasProvider,
  addMiddlewareResolver,
  addScheduleProvider,
  addBindingProvider,
  addIdentifierMetadata,
  getRegisteredAliasProviders,
  getRegisteredScheduleProviders,
  getRegisteredBindingProviders,
  getRegisteredIdentifierMetadata,
  getRegisteredMiddlewareResolvers,
} from './store.js';
import type {
  AliasProvider,
  MiddlewareResolver,
  ScheduleProvider,
  BindingProvider,
  IdentifierMetadata as MetadataType,
} from './types.js';

const INVALID_NAME_PATTERN = /[/\s]/;

function assertValidIdentifierName(name: string, providerLabel: string): void {
  if (typeof name !== 'string' || name.length === 0 || INVALID_NAME_PATTERN.test(name)) {
    throw new KerithError(
      'INVALID_IDENTIFIER_NAME',
      `invalid ${providerLabel} name "${name}" — must be a non-empty string with no "/" or whitespace`,
    );
  }
}

export function registerAliasProvider(provider: AliasProvider): void {
  assertValidIdentifierName(provider.name, 'AliasProvider');
  assertValidIdentifierName(provider.prefix, 'AliasProvider prefix');
  addAliasProvider(provider);
}

export function registerMiddlewareResolver(resolver: MiddlewareResolver): void {
  assertValidIdentifierName(resolver.name, 'MiddlewareResolver');
  addMiddlewareResolver(resolver);
}

export function registerScheduleProvider(provider: ScheduleProvider): void {
  assertValidIdentifierName(provider.name, 'ScheduleProvider');
  addScheduleProvider(provider);
}

export function registerBindingProvider(provider: BindingProvider): void {
  assertValidIdentifierName(provider.name, 'BindingProvider');
  addBindingProvider(provider);
}

export function registerIdentifierMetadata(meta: MetadataType): void {
  const exists = getRegisteredIdentifierMetadata().some(m => m.name === meta.name);
  if (exists) {
    throw new KerithError('DUPLICATE_EXTENSION_PROVIDER', `duplicate IdentifierMetadata "${meta.name}"`);
  }
  addIdentifierMetadata(meta);
}

export type * from './types.js';

export {
  getRegisteredAliasProviders,
  getRegisteredBindingProviders,
  getRegisteredScheduleProviders,
  getRegisteredMiddlewareResolvers,
  getRegisteredIdentifierMetadata,
} from './store.js';
