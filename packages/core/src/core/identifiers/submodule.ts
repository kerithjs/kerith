import path from 'node:path';
import { getActiveRegistry } from '../registry.js';
import { getModuleCallerInfo } from '../caller.js';
import { KerithError } from '../errors.js';
import { normalizePath } from '../utils/paths.js';
import { buildSubModuleQualifiedName } from '../registry.js';
import {
  inferDomain,
  inferParentModule,
  type DomainScanEntry,
  type ModuleScanEntry,
} from '../../bootstrap/scanner.js';
import type { SubModuleOptions } from '../types/hierarchy.js';
import { assertCalledFromIndex, assertNameMatchesFolder } from './validation.js';

function toDomainScanEntries(
  domains: { name: string; path: string }[],
): DomainScanEntry[] {
  return domains.map((d) => ({
    name: d.name,
    dirPath: d.path,
    indexPath: '',
    options: {},
  }));
}

function toModuleScanEntries(
  modules: { name: string; path: string; indexPath: string; imports: string[]; exports: string[] }[],
): ModuleScanEntry[] {
  return modules.map((m) => ({
    name: m.name,
    dirPath: m.path,
    indexPath: m.indexPath,
    imports: m.imports,
    exports: m.exports,
    shared: [],
    options: {},
  }));
}

/**
 * Declares a Kerith sub-module. Parent module and domain are inferred from the path.
 * Must be called from the sub-module's index file.
 */
export function SubModule(name: string, options: SubModuleOptions = {}): void {
  if (typeof name !== 'string') {
    throw new TypeError(`SubModule name must be a string, received ${typeof name}`);
  }

  const { filePath: indexPath, dirPath } = getModuleCallerInfo('SubModule()');

  assertNameMatchesFolder(name, dirPath, 'INVALID_SUBMODULE_DECLARATION', 'SubModule');
  assertCalledFromIndex(indexPath, 'INVALID_SUBMODULE_DECLARATION', 'SubModule');

  const registry = getActiveRegistry();
  const parentDir = normalizePath(path.dirname(dirPath));

  if (registry.isSubModulePath(parentDir)) {
    throw new KerithError(
      'SUBMODULE_NESTED',
      `SubModule '${name}' cannot contain nested SubModules`,
      `Path: ${dirPath}`,
    );
  }

  const domainEntries = toDomainScanEntries(registry.getAllDomains());
  const moduleEntries = toModuleScanEntries(
    registry
      .getAllModules()
      .map((m) => {
        const raw = registry.getRawModule(m.name, m.domain);
        if (!raw) return null;
        return {
          name: m.name,
          path: raw.path,
          indexPath: raw.indexPath,
          imports: m.imports,
          exports: m.exports,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
  );

  const parentModule = inferParentModule(indexPath, moduleEntries);
  if (!parentModule) {
    throw new KerithError(
      'PARENT_MODULE_NOT_FOUND',
      `SubModule '${name}' has no parent module in the registry.`,
      `Register the parent module before calling SubModule(). Path: ${dirPath}`,
    );
  }

  const domain = inferDomain(indexPath, domainEntries);
  const qualifiedName = buildSubModuleQualifiedName(name, parentModule, domain);

  if (registry.hasSubModule(qualifiedName)) {
    const existing = registry
      .getAllSubModules()
      .find((s) => s.name === name && normalizePath(s.path) === normalizePath(dirPath));
    if (existing) {
      return;
    }
  }

  registry.registerSubModule({
    name,
    path: dirPath,
    parentModule,
    domain,
    description: options.description,
  });
}
