import type {
  AliasProvider,
  MiddlewareResolver,
  ScheduleProvider,
  BindingProvider,
  IdentifierMetadata,
} from './types.js';

// Private arrays
const aliasProviders: AliasProvider[] = [];
const middlewareResolvers: MiddlewareResolver[] = [];
const scheduleProviders: ScheduleProvider[] = [];
const bindingProviders: BindingProvider[] = [];
const identifierMetadata: IdentifierMetadata[] = [];

// Internal mutators for the registration functions
export function addAliasProvider(provider: AliasProvider): void {
  aliasProviders.push(provider);
}

export function addMiddlewareResolver(resolver: MiddlewareResolver): void {
  middlewareResolvers.push(resolver);
}

export function addScheduleProvider(provider: ScheduleProvider): void {
  scheduleProviders.push(provider);
}

export function addBindingProvider(provider: BindingProvider): void {
  bindingProviders.push(provider);
}

export function addIdentifierMetadata(metadata: IdentifierMetadata): void {
  identifierMetadata.push(metadata);
}

// Internal getters
export function getRegisteredAliasProviders(): ReadonlyArray<AliasProvider> {
  return aliasProviders;
}

export function getRegisteredMiddlewareResolvers(): ReadonlyArray<MiddlewareResolver> {
  return middlewareResolvers;
}

export function getRegisteredScheduleProviders(): ReadonlyArray<ScheduleProvider> {
  return scheduleProviders;
}

export function getRegisteredBindingProviders(): ReadonlyArray<BindingProvider> {
  return bindingProviders;
}

export function getRegisteredIdentifierMetadata(): ReadonlyArray<IdentifierMetadata> {
  return identifierMetadata;
}

// Test utility
export function _resetExtensionStore(): void {
  aliasProviders.length = 0;
  middlewareResolvers.length = 0;
  scheduleProviders.length = 0;
  bindingProviders.length = 0;
  identifierMetadata.length = 0;
}

