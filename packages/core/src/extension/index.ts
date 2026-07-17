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

export function registerAliasProvider(provider: AliasProvider): void {
  const exists = getRegisteredAliasProviders().some(p => p.name === provider.name);
  if (exists) {
    throw new KerithError('DUPLICATE_EXTENSION_PROVIDER', `duplicate AliasProvider "${provider.name}"`);
  }
  addAliasProvider(provider);
}

export function registerMiddlewareResolver(resolver: MiddlewareResolver): void {
  // MiddlewareResolver doesn't have a name property in its type signature,
  // so duplicate name validation doesn't apply here.
  addMiddlewareResolver(resolver);
}

export function registerScheduleProvider(provider: ScheduleProvider): void {
  const exists = getRegisteredScheduleProviders().some(p => p.name === provider.name);
  if (exists) {
    throw new KerithError('DUPLICATE_EXTENSION_PROVIDER', `duplicate ScheduleProvider "${provider.name}"`);
  }
  addScheduleProvider(provider);
}

export function registerBindingProvider(provider: BindingProvider): void {
  const exists = getRegisteredBindingProviders().some(p => p.name === provider.name);
  if (exists) {
    throw new KerithError('DUPLICATE_EXTENSION_PROVIDER', `duplicate BindingProvider "${provider.name}"`);
  }
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

