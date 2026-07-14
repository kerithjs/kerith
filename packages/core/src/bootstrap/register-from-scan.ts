import type { InternalRegistry } from '../core/registry.js';
import { buildSubModuleQualifiedName } from '../core/registry.js';
import type { LogHandler } from '../types/index.js';
import type {
  DomainScanEntry,
  SubModuleScanEntry,
  ScanResult,
} from './scanner.js';

/**
 * Step 3.1 — Seed domains from filesystem scan so Module() can resolve domain context
 * before index files are imported.
 */
export function registerDomainsFromScan(
  registry: InternalRegistry,
  domains: DomainScanEntry[],
): void {
  const registeredAt = new Date().toISOString();

  for (const domain of domains) {
    if (registry.hasDomain(domain.name)) {
      continue;
    }

    registry.registerDomain({
      name: domain.name,
      path: domain.dirPath,
      description:
        typeof domain.options.description === 'string'
          ? domain.options.description
          : undefined,
      registeredAt,
    });
  }
}

/**
 * Step 3.2 — Register shared alias roots discovered by the scanner (Parte 2 foundation).
 */
export function registerSharedFromScan(
  registry: InternalRegistry,
  shared: ScanResult['shared'],
  log?: LogHandler,
): void {
  for (const entry of shared) {
    registry.registerShared(entry, log);
    registry.registerAlias(entry.alias, entry.path);
    registry.registerAlias(`${entry.alias}/*`, `${entry.path}/*`);
  }
}

/**
 * Step 3.3 — Register modules (flat and domain-scoped) from scan so
 * checkSharedAccess() can read their declared shared[] via getRawModule().
 */
export function registerModulesFromScan(
  registry: InternalRegistry,
  modules: ScanResult['modules'],
): void {
  for (const mod of modules) {
    if (mod.synthetic) {
      continue;
    }

    if (registry.getRawModule(mod.name, mod.domain)) {
      continue;
    }

    registry.registerModule(
      mod.name,
      {
        imports: mod.imports,
        exports: mod.exports,
        shared: mod.shared,
      },
      mod.dirPath,
      mod.indexPath,
      mod.dirPath, // synthetic id — placeholder hasta que corra el Module() real
      mod.domain,
      true, // fromScan — permite que el registro real de Module() lo finalice/reemplace
    );
  }
}

/**
 * Step 3.4 — Pre-register submodules from scan (parent/domain inferred by scanner).
 */
export function registerSubModulesFromScan(
  registry: InternalRegistry,
  submodules: SubModuleScanEntry[],
): void {
  for (const sub of submodules) {
    const qualifiedName = buildSubModuleQualifiedName(
      sub.name,
      sub.parentModule,
      sub.domain,
    );

    if (registry.hasSubModule(qualifiedName)) {
      continue;
    }

    registry.registerSubModule({
      name: sub.name,
      path: sub.dirPath,
      parentModule: sub.parentModule,
      domain: sub.domain,
      description:
        typeof sub.options?.description === 'string' ? sub.options.description : undefined,
    });
  }
}

export function registerEntitiesFromScan(
  registry: InternalRegistry,
  scan: ScanResult,
  log?: LogHandler,
): void {
  registerDomainsFromScan(registry, scan.domains);
  registerSharedFromScan(registry, scan.shared, log);
  registerModulesFromScan(registry, scan.modules);
  registerSubModulesFromScan(registry, scan.submodules);
}
