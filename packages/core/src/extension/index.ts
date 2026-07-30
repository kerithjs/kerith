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

/**
 * Checks for duplicate providers and throws appropriate error based on filePath comparison.
 * If filePaths match (same file), throws specific DUPLICATE_*_IDENTIFIER error.
 * If filePaths differ (different files), throws generic DUPLICATE_EXTENSION_PROVIDER error.
 */
function checkDuplicateProvider(
  existingProviders: ReadonlyArray<{ name: string; filePath: string }>,
  newName: string,
  newFilePath: string,
  specificErrorCode: 'DUPLICATE_ALIAS_IDENTIFIER' | 'DUPLICATE_MIDDLEWARE_IDENTIFIER' | 'DUPLICATE_SCHEDULE_IDENTIFIER' | 'DUPLICATE_BINDING_IDENTIFIER',
  providerType: string
): void {
  const existing = existingProviders.find(p => p.name === newName);
  if (existing) {
    if (existing.filePath === newFilePath) {
      throw new KerithError(
        specificErrorCode,
        `duplicate ${providerType} "${newName}" inside the same file`,
        `File: ${newFilePath}`
      );
    } else {
      throw new KerithError(
        'DUPLICATE_EXTENSION_PROVIDER',
        `duplicate ${providerType} "${newName}" across different files`,
        `Conflicts between ${existing.filePath} and ${newFilePath}`
      );
    }
  }
}

export function registerAliasProvider(provider: AliasProvider): void {
  assertValidIdentifierName(provider.name, 'AliasProvider');
  assertValidIdentifierName(provider.prefix, 'AliasProvider prefix');
  
  const existingProviders = getRegisteredAliasProviders();
  const uniqueKey = `${provider.prefix}/${provider.name}`;
  
  // Check for duplicate prefix/name combination
  const existing = existingProviders.find(p => `${p.prefix}/${p.name}` === uniqueKey);
  if (existing) {
    if (existing.filePath === provider.filePath) {
      throw new KerithError(
        'DUPLICATE_ALIAS_IDENTIFIER',
        `duplicate AliasProvider "${uniqueKey}" inside the same file`,
        `File: ${provider.filePath}`
      );
    } else {
      throw new KerithError(
        'DUPLICATE_EXTENSION_PROVIDER',
        `duplicate AliasProvider "${uniqueKey}" across different files`,
        `Conflicts between ${existing.filePath} and ${provider.filePath}`
      );
    }
  }
  
  addAliasProvider(provider);
}

export function registerMiddlewareResolver(resolver: MiddlewareResolver): void {
  assertValidIdentifierName(resolver.name, 'MiddlewareResolver');
  
  const existingProviders = getRegisteredMiddlewareResolvers();
  checkDuplicateProvider(
    existingProviders,
    resolver.name,
    resolver.filePath,
    'DUPLICATE_MIDDLEWARE_IDENTIFIER',
    'MiddlewareResolver'
  );
  
  addMiddlewareResolver(resolver);
}

export function registerScheduleProvider(provider: ScheduleProvider): void {
  assertValidIdentifierName(provider.name, 'ScheduleProvider');
  
  const existingProviders = getRegisteredScheduleProviders();
  checkDuplicateProvider(
    existingProviders,
    provider.name,
    provider.filePath,
    'DUPLICATE_SCHEDULE_IDENTIFIER',
    'ScheduleProvider'
  );
  
  addScheduleProvider(provider);
}

export function registerBindingProvider(provider: BindingProvider): void {
  assertValidIdentifierName(provider.name, 'BindingProvider');
  
  const existingProviders = getRegisteredBindingProviders();
  checkDuplicateProvider(
    existingProviders,
    provider.name,
    provider.filePath,
    'DUPLICATE_BINDING_IDENTIFIER',
    'BindingProvider'
  );
  
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
  _resetExtensionStore,
} from './store.js';
