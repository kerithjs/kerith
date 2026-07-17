export * from './core/registry.js';
export type {
  DomainRegistration,
  SubModuleRegistration,
  ModuleRegistration,
} from './core/types/registry.js';
export * from './core/errors.js';
export { getFileCallerInfo } from './core/caller.js';

export * from './identifiers/module.js';
export * from './core/identifiers/domain.js';
export * from './core/identifiers/submodule.js';
export * from './identifiers/controller.js';
export * from './identifiers/service.js';
export * from './identifiers/repository.js';
export * from './identifiers/schema.js';

export * from './bootstrap/createApp.js';
export * from './aliases/getAliases.js';
export * from './aliases/cache.js';
export * from './aliases/resolver.js';
export * from './core/config.js';
export * from './core/logger.js';
export * from './core/http-logger.js';
export * from './preload/index.js';

export * from './config/kerith-config.types.js';
export type * from './config/kerith-config.types.js';
export * from './config/kerith-config.js';
export type * from './config/kerith-config.js';

export type {
  CreateAppOptions,
  KerithApp,
  KerithRegistry,
  KerithRegistryAdvanced,
  RegisteredModule,
  MountedRoute,
  ModuleOptions,
  DomainOptions,
  SubModuleOptions,
  HierarchyLevel,
  ControllerOptions,
  ServiceOptions,
  RepositoryOptions,
  SchemaOptions,
  GetAliasesOptions,
  LogLevel,
  LogHandler,
  Logger,
  HttpLogger,
  HttpLoggerOptions,
  LogFormat,
  WatcherOptions
} from './types/index.js';

export type { PreloadConfig } from './preload/index.js';
