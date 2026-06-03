import { AsyncLocalStorage } from 'node:async_hooks';
import { KerithError } from './errors.js';
import { findCircularDependencies } from './utils/cycle-detector.js';
import { normalizePath } from './utils/paths.js';
import type {
  ModuleEntry,
  RegisteredModule,
  KerithRegistryAdvanced,
  ControllerEntry,
  ServiceEntry,
  RepositoryEntry,
  SchemaEntry,
  FileEntry,
} from '../types/index.js';
import type { ModuleOptions } from './types/hierarchy.js';
import type { HierarchyLevel } from './types/hierarchy.js';
import type {
  DomainRegistration,
  SubModuleRegistration,
  ModuleRegistration,
} from './types/registry.js';
import {
  buildModuleKey,
  buildSubModuleQualifiedName,
} from './types/registry.js';

export {
  buildModuleKey,
  buildSubModuleQualifiedName,
} from './types/registry.js';
export type {
  DomainRegistration,
  SubModuleRegistration,
  ModuleRegistration,
} from './types/registry.js';

export type FeatureRegistration = FileEntry;

const toRegisteredModule = (entry: ModuleEntry): RegisteredModule => ({
  id: entry.nitsId,
  name: entry.name,
  domain: entry.domain,
  path: entry.path,
  imports: entry.imports,
  exports: entry.exports,
  controllers: entry.controllers.map((c) => c.name),
});

const toModuleRegistration = (entry: ModuleEntry): ModuleRegistration =>
  toRegisteredModule(entry);

/**
 * Extended interface for internal use (includes mutators)
 * @internal
 */
export interface InternalRegistry extends KerithRegistryAdvanced {
  seedNitsIds(mapping: Map<string, string>): void;
  getNitsIdForPath(dirPath: string): string | undefined;
  registerModule(
    name: string,
    options: ModuleOptions,
    dirPath: string,
    indexPath: string,
    nitsId: string,
    domain?: string,
  ): void;
  registerDomain(entry: DomainRegistration): void;
  registerSubModule(entry: SubModuleRegistration): void;
  hasDomain(name: string): boolean;
  getDomain(name: string): DomainRegistration | undefined;
  getAllDomains(): DomainRegistration[];
  getDomainModules(domainName: string): ModuleRegistration[];
  hasSubModule(qualifiedName: string): boolean;
  isSubModulePath(dirPath: string): boolean;
  getAllSubModules(): SubModuleRegistration[];
  getModuleSubModules(moduleName: string, domain?: string): SubModuleRegistration[];
  resolveHierarchyLevel(name: string, path: string): HierarchyLevel;
  hasModuleById(nitsId: string): boolean;
  getModuleById(nitsId: string): RegisteredModule | undefined;
  getModuleByPath(dirPath: string): RegisteredModule | undefined;
  registerAlias(alias: string, path: string): void;
  getRegisteredAliases(): string[];
  registerControllerMetadata(entry: ControllerEntry): void;
  getAllControllersMetadata(): ControllerEntry[];
  getControllerMetadata(filePath: string): ControllerEntry | undefined;
  getRawModule(name: string, domain?: string): ModuleEntry | undefined;
  registerFileMetadata(entry: FileEntry): void;
  getAllServices(): ServiceEntry[];
  getService(name: string): ServiceEntry | undefined;
  getAllRepositories(): RepositoryEntry[];
  getRepository(name: string): RepositoryEntry | undefined;
  getAllSchemas(): SchemaEntry[];
  getSchema(name: string): SchemaEntry | undefined;
  clearRegistry(): void;
}

function resolveModuleId(
  modulesByName: Map<string, string>,
  name: string,
  domain?: string,
): string | undefined {
  const key = buildModuleKey(name, domain);
  const byKey = modulesByName.get(key);
  if (byKey) return byKey;
  if (domain === undefined) {
    return modulesByName.get(name);
  }
  return undefined;
}

/**
 * Creates a new independent registry instance.
 * @internal
 */
export function createRegistry(): InternalRegistry {
  const modules = new Map<string, ModuleEntry>();
  const modulesByName = new Map<string, string>();
  const modulesByPath = new Map<string, string>();
  const seededNitsIds = new Map<string, string>();

  const domains = new Map<string, DomainRegistration>();
  const domainsByPath = new Map<string, string>();
  const submodules = new Map<string, SubModuleRegistration>();
  const submodulesByPath = new Map<string, string>();

  const aliases = new Map<string, string>();
  const controllers = new Map<string, ControllerEntry>();
  const services = new Map<string, ServiceEntry>();
  const repositories = new Map<string, RepositoryEntry>();
  const schemas = new Map<string, SchemaEntry>();

  return {
    hasModule(name: string, domain?: string): boolean {
      return resolveModuleId(modulesByName, name, domain) !== undefined;
    },

    getModule(name: string, domain?: string): RegisteredModule | undefined {
      const id = resolveModuleId(modulesByName, name, domain);
      if (!id) return undefined;
      const entry = modules.get(id);
      return entry ? toRegisteredModule(entry) : undefined;
    },

    getAllModules(): RegisteredModule[] {
      return Array.from(modules.values()).map(toRegisteredModule);
    },

    hasModuleById(nitsId: string): boolean {
      return modules.has(nitsId);
    },

    getModuleById(nitsId: string): RegisteredModule | undefined {
      const entry = modules.get(nitsId);
      return entry ? toRegisteredModule(entry) : undefined;
    },

    getModuleByPath(dirPath: string): RegisteredModule | undefined {
      const nitsId = modulesByPath.get(normalizePath(dirPath));
      if (!nitsId) return undefined;
      const entry = modules.get(nitsId);
      return entry ? toRegisteredModule(entry) : undefined;
    },

    resolveAlias(alias: string): string | undefined {
      return aliases.get(alias);
    },

    getAllAliases(): Record<string, string> {
      return Object.fromEntries(aliases.entries());
    },

    getRegisteredAliases(): string[] {
      const keys = [...aliases.keys()].filter((k) => !k.endsWith('/*'));
      return keys.length > 0 ? keys : ['@modules'];
    },

    getDependencyGraph(): Map<string, string[]> {
      const graph = new Map<string, string[]>();
      for (const entry of modules.values()) {
        const key = buildModuleKey(entry.name, entry.domain);
        graph.set(key, entry.imports);
      }
      return graph;
    },

    findCircularDependencies(): string[][] {
      const dependencyMap = new Map<string, string[]>();
      for (const entry of modules.values()) {
        dependencyMap.set(buildModuleKey(entry.name, entry.domain), entry.imports);
      }
      return findCircularDependencies(dependencyMap);
    },

    seedNitsIds(mapping: Map<string, string>): void {
      for (const [dirPath, id] of mapping.entries()) {
        seededNitsIds.set(normalizePath(dirPath), id);
      }
    },

    getNitsIdForPath(dirPath: string): string | undefined {
      return seededNitsIds.get(normalizePath(dirPath));
    },

    registerModule(
      name: string,
      options: ModuleOptions,
      dirPath: string,
      indexPath: string,
      nitsId: string,
      domain?: string,
    ): void {
      if (modules.has(nitsId)) {
        throw new KerithError(
          'DUPLICATE_MODULE',
          `A module with this NITS ID already exists. Identity must be unique.`,
          `NITS ID: ${nitsId}, Name: ${name}, Path: ${dirPath}`,
        );
      }

      const normalizedPath = normalizePath(dirPath);
      const key = buildModuleKey(name, domain);

      if (modulesByPath.has(normalizedPath)) {
        const existingId = modulesByPath.get(normalizedPath)!;
        const existing = modules.get(existingId);
        throw new KerithError(
          'DUPLICATE_MODULE',
          `A module is already registered for this folder. Call Module() only once per directory.`,
          `Existing: ${existing?.name}, New: ${name}, Folder: ${dirPath}`,
        );
      }

      if (modulesByName.has(key) && modulesByName.get(key) !== nitsId) {
        throw new KerithError(
          'DUPLICATE_MODULE',
          `A module with the key "${key}" is already registered.`,
          `Duplicate key: ${key}, Path: ${dirPath}`,
        );
      }

      const entry: ModuleEntry = {
        nitsId,
        name,
        domain,
        path: dirPath,
        indexPath,
        imports: options.imports || [],
        exports: options.exports || [],
        shared: options.shared || [],
        controllers: [],
      };

      modules.set(nitsId, entry);
      modulesByName.set(key, nitsId);
      modulesByPath.set(normalizedPath, nitsId);
    },

    registerDomain(entry: DomainRegistration): void {
      const normalizedPath = normalizePath(entry.path);

      if (domains.has(entry.name)) {
        throw new KerithError(
          'DUPLICATE_DOMAIN',
          `A domain named "${entry.name}" is already registered.`,
          `Duplicate name: ${entry.name}, Path: ${entry.path}`,
        );
      }

      if (domainsByPath.has(normalizedPath)) {
        const existingName = domainsByPath.get(normalizedPath)!;
        throw new KerithError(
          'DUPLICATE_DOMAIN',
          `A domain is already registered for this folder.`,
          `Existing: ${existingName}, New: ${entry.name}, Folder: ${entry.path}`,
        );
      }

      domains.set(entry.name, entry);
      domainsByPath.set(normalizedPath, entry.name);
    },

    registerSubModule(entry: SubModuleRegistration): void {
      const normalizedPath = normalizePath(entry.path);
      const qualifiedName = buildSubModuleQualifiedName(
        entry.name,
        entry.parentModule,
        entry.domain,
      );

      if (submodules.has(qualifiedName)) {
        throw new KerithError(
          'DUPLICATE_SUBMODULE',
          `A sub-module "${qualifiedName}" is already registered.`,
          `Duplicate key: ${qualifiedName}, Path: ${entry.path}`,
        );
      }

      if (submodulesByPath.has(normalizedPath)) {
        const existingKey = submodulesByPath.get(normalizedPath)!;
        throw new KerithError(
          'DUPLICATE_SUBMODULE',
          `A sub-module is already registered for this folder.`,
          `Existing: ${existingKey}, New: ${qualifiedName}, Folder: ${entry.path}`,
        );
      }

      submodules.set(qualifiedName, entry);
      submodulesByPath.set(normalizedPath, qualifiedName);
    },

    hasDomain(name: string): boolean {
      return domains.has(name);
    },

    getDomain(name: string): DomainRegistration | undefined {
      return domains.get(name);
    },

    getAllDomains(): DomainRegistration[] {
      return Array.from(domains.values());
    },

    getDomainModules(domainName: string): ModuleRegistration[] {
      return Array.from(modules.values())
        .filter((m) => m.domain === domainName)
        .map(toModuleRegistration);
    },

    hasSubModule(qualifiedName: string): boolean {
      return submodules.has(qualifiedName);
    },

    isSubModulePath(dirPath: string): boolean {
      return submodulesByPath.has(normalizePath(dirPath));
    },

    getAllSubModules(): SubModuleRegistration[] {
      return Array.from(submodules.values());
    },

    getModuleSubModules(moduleName: string, domain?: string): SubModuleRegistration[] {
      return Array.from(submodules.values()).filter(
        (s) => s.parentModule === moduleName && s.domain === domain,
      );
    },

    resolveHierarchyLevel(name: string, path: string): HierarchyLevel {
      const normalized = normalizePath(path);

      for (const domain of domains.values()) {
        if (normalizePath(domain.path) === normalized || domain.name === name) {
          return 'domain';
        }
      }

      for (const sub of submodules.values()) {
        if (normalizePath(sub.path) === normalized) {
          return 'submodule';
        }
      }

      for (const mod of modules.values()) {
        if (normalizePath(mod.path) === normalized) {
          return 'module';
        }
      }

      if (domains.has(name)) return 'domain';
      if (submodules.has(name)) return 'submodule';
      return 'module';
    },

    registerAlias(alias: string, targetPath: string): void {
      aliases.set(alias, targetPath);
    },

    registerControllerMetadata(entry: ControllerEntry): void {
      const normalizedPath = normalizePath(entry.path);
      if (controllers.has(normalizedPath)) {
        throw new KerithError(
          'INVALID_CONTROLLER',
          `Controller() was called more than once in the same file.`,
          `File: ${entry.path}`,
        );
      }
      controllers.set(normalizedPath, entry);
    },

    getControllerMetadata(filePath: string): ControllerEntry | undefined {
      return controllers.get(normalizePath(filePath));
    },

    getAllControllersMetadata(): ControllerEntry[] {
      return Array.from(controllers.values());
    },

    getRawModule(name: string, domain?: string): ModuleEntry | undefined {
      const id = resolveModuleId(modulesByName, name, domain);
      return id ? modules.get(id) : undefined;
    },

    registerFileMetadata(entry: FileEntry): void {
      if (entry.type === 'service') {
        if (services.has(entry.name)) {
          throw new KerithError(
            'DUPLICATE_SERVICE',
            `A service named "${entry.name}" is already registered. Each Service() name must be unique within the registry.`,
            `Duplicate name: ${entry.name}`,
          );
        }
        services.set(entry.name, entry);
      } else if (entry.type === 'repository') {
        if (repositories.has(entry.name)) {
          throw new KerithError(
            'DUPLICATE_REPOSITORY',
            `A repository named "${entry.name}" is already registered. Each Repository() name must be unique within the registry.`,
            `Duplicate name: ${entry.name}`,
          );
        }
        repositories.set(entry.name, entry);
      } else if (entry.type === 'schema') {
        if (schemas.has(entry.name)) {
          throw new KerithError(
            'DUPLICATE_SCHEMA',
            `A schema named "${entry.name}" is already registered. Each Schema() name must be unique within the registry.`,
            `Duplicate name: ${entry.name}`,
          );
        }
        schemas.set(entry.name, entry);
      }
    },

    getAllServices(): ServiceEntry[] {
      return Array.from(services.values());
    },

    getService(name: string): ServiceEntry | undefined {
      return services.get(name);
    },

    getAllRepositories(): RepositoryEntry[] {
      return Array.from(repositories.values());
    },

    getRepository(name: string): RepositoryEntry | undefined {
      return repositories.get(name);
    },

    getAllSchemas(): SchemaEntry[] {
      return Array.from(schemas.values());
    },

    getSchema(name: string): SchemaEntry | undefined {
      return schemas.get(name);
    },

    clearRegistry(): void {
      modules.clear();
      modulesByName.clear();
      modulesByPath.clear();
      seededNitsIds.clear();
      domains.clear();
      domainsByPath.clear();
      submodules.clear();
      submodulesByPath.clear();
      aliases.clear();
      controllers.clear();
      services.clear();
      repositories.clear();
      schemas.clear();
    },
  };
}

export const registryContext = new AsyncLocalStorage<InternalRegistry>();

export function getActiveRegistry(): InternalRegistry {
  const store = registryContext.getStore();
  if (!store) {
    throw new KerithError(
      'REGISTRY_MISSING_CONTEXT',
      'No active registry found in the current async context. Ensure code runs inside a createApp() execution scope.',
    );
  }
  return store;
}

export const getRegistry = (): KerithRegistryAdvanced => getActiveRegistry();
