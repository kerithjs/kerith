import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { KerithConfig } from '../config/kerith-config.types.js';
import type { LogHandler, SharedEntry } from '../types/index.js';
import { extractMultipleIdentifierCalls, extractTopLevelIdentifier } from '../cli/lib/ast-parser.js';
import { normalizePath } from '../core/utils/paths.js';
import { KerithError } from '../core/errors.js';
import {
  inferDomain as _inferDomain,
  inferParentModule as _inferParentModule,
  type DomainEntry,
  type ModuleEntry,
} from '../core/utils/domain-inference.js';

// ─── Scan result types ─────────────────────────────────────────────────────────

export interface DomainScanEntry {
  name: string;
  dirPath: string;
  indexPath: string;
  options: Record<string, unknown>;
}

export interface ModuleScanEntry {
  name: string;
  dirPath: string;
  indexPath: string;
  domain?: string;
  imports: string[];
  exports: string[];
  shared: string[];
  options: Record<string, unknown>;
}

export interface SubModuleScanEntry {
  name: string;
  dirPath: string;
  indexPath: string;
  parentModule: string;
  domain?: string;
  options: Record<string, unknown>;
}

export interface ScanResult {
  domains: DomainScanEntry[];
  modules: ModuleScanEntry[];
  submodules: SubModuleScanEntry[];
  shared: SharedEntry[];
}

export interface ScanOptions {
  cwd?: string;
  ignore?: string[];
  log?: LogHandler;
  domainsToScan?: string[];
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SCAN_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/*.d.ts',
  '**/*.map',
  '**/.kerith/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.cache/**',
  '**/.nyc_output/**',
  '**/__pycache__/**',
  '**/tmp/**',
  '**/_shared/**',
] as const;

const INDEX_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs'] as const;

// ─── Path helpers ────────────────────────────────────────────────────────────

function resolveIndexFile(dirPath: string): string | null {
  for (const ext of INDEX_EXTENSIONS) {
    const candidate = path.join(dirPath, `index${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function stringArrayOption(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

// ─── Hierarchy inference (re-exported from core/utils/domain-inference) ───────

/**
 * Infers which registered domain a file belongs to.
 * Re-exported from `core/utils/domain-inference` to preserve the public
 * contract of this module without introducing a circular dependency.
 */
export function inferDomain(
  filePath: string,
  domains: DomainEntry[],
): string | undefined {
  return _inferDomain(filePath, domains);
}

/**
 * Infers the parent module of a sub-module by walking up its directory tree.
 * Re-exported from `core/utils/domain-inference` to preserve the public
 * contract of this module without introducing a circular dependency.
 */
export function inferParentModule(
  filePath: string,
  modules: ModuleEntry[],
): string | undefined {
  return _inferParentModule(filePath, modules);
}

// ─── Shared detection ────────────────────────────────────────────────────────

/**
 * Detects shared roots by filesystem convention only — no Kerith identifier required.
 * Global `shared/` is checked first; each domain's `_shared/` is checked after domains are known.
 * Missing folders are not an error — the alias simply won't be registered.
 */
async function detectSharedEntries(
  scanRoot: string,
  domains: DomainScanEntry[],
  log?: LogHandler,
): Promise<SharedEntry[]> {
  const shared: SharedEntry[] = [];

  const globalSharedPath = path.join(scanRoot, 'shared');
  try {
    if (fs.existsSync(globalSharedPath) && fs.statSync(globalSharedPath).isDirectory()) {
      shared.push({
        type: 'global',
        alias: '@shared',
        path: globalSharedPath,
      });
    }
  } catch {
    // Ignorar — path desapareció entre existsSync y statSync (race condition)
  }

  for (const domain of domains) {
    const sharedPath = path.join(domain.dirPath, '_shared');
    if (fs.existsSync(sharedPath) && fs.statSync(sharedPath).isDirectory()) {
      // Guard: warn if developer accidentally put a Kerith identifier inside _shared.
      // _shared is excluded from the module scan glob, so Module() / Domain() / SubModule()
      // declarations there will be silently ignored — emit an actionable warning instead.
      const sharedIndex = resolveIndexFile(sharedPath);
      if (sharedIndex) {
        const ident = await extractTopLevelIdentifier(sharedIndex);
        if (ident && ['Domain', 'Module', 'SubModule'].includes(ident.type)) {
          log?.(
            'warn',
            `[Kerith] _shared directory for domain "${domain.name}" contains a Kerith identifier (${ident.type}("${ident.name}")) in its index file. _shared is excluded from module scanning — this identifier will be silently ignored. Remove the identifier or move the file outside _shared.`,
            { _module: 'scanner', domain: domain.name, identifierType: ident.type, path: sharedIndex },
          );
        }
      }

      shared.push({
        type: 'domain-scoped',
        alias: `@${domain.name}/shared`,
        path: sharedPath,
        domain: domain.name,
      });
    }
  }

  return shared;
}

// ─── Origin scanner (v2) ─────────────────────────────────────────────────────

export async function scanOrigin(
  originPath: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const absoluteOrigin = path.resolve(originPath);
  if (!fs.existsSync(absoluteOrigin)) {
    throw new KerithError(
      'ORIGIN_NOT_FOUND',
      `origin '${originPath}' not found. Set origin in kerith.config.js`,
    );
  }

  const ignore = options.ignore ?? [...DEFAULT_SCAN_IGNORE];
  
  let globPatterns: string[];
  if (options.domainsToScan && options.domainsToScan.length > 0) {
    globPatterns = options.domainsToScan.map(domain => {
      if (domain === '__flat__') {
        return path.join(absoluteOrigin, '*', '**', 'index.{ts,js,mts,mjs}').replace(/\\/g, '/');
      }
      return path.join(absoluteOrigin, domain, '**', 'index.{ts,js,mts,mjs}').replace(/\\/g, '/');
    });
  } else {
    globPatterns = [path.join(absoluteOrigin, '**', 'index.{ts,js,mts,mjs}').replace(/\\/g, '/')];
  }

  const indexFiles = await fg(globPatterns, {
    absolute: true,
    cwd: options.cwd ?? process.cwd(),
    ignore,
  });

  const domains: DomainScanEntry[] = [];
  const modules: ModuleScanEntry[] = [];
  const submodules: SubModuleScanEntry[] = [];
  const log = options.log;

  // 1. Parallel I/O
  const parsedFiles = await Promise.all(
    indexFiles.map(async (indexPath) => {
      const calls = await extractMultipleIdentifierCalls(indexPath, ['Domain', 'Module', 'SubModule']);
      return { indexPath, calls };
    })
  );

  // 2. Sequential mutation
  for (const { indexPath, calls } of parsedFiles) {
    if (calls.length === 0) {
      continue;
    }

    const identifier = calls[0]; // First one in source order is the primary identity
    const dirPath = path.dirname(indexPath);

    switch (identifier.type) {
      case 'Domain':
        domains.push({
          name: identifier.name,
          dirPath,
          indexPath,
          options: identifier.options,
        });
        break;
      case 'Module':
        modules.push({
          name: identifier.name,
          dirPath,
          indexPath,
          imports: stringArrayOption(identifier.options.imports),
          exports: stringArrayOption(identifier.options.exports),
          shared: stringArrayOption(identifier.options.shared),
          options: identifier.options,
        });
        
        // Inline domain check (single pass)
        const domainCall = calls.find(c => c.type === 'Domain');
        if (domainCall) {
          if (!domains.some(d => d.name === domainCall.name && normalizePath(d.dirPath) === normalizePath(dirPath))) {
            domains.push({
              name: domainCall.name,
              dirPath,
              indexPath,
              options: domainCall.options,
            });
          }
        }
        break;
      case 'SubModule':
        submodules.push({
          name: identifier.name,
          dirPath,
          indexPath,
          parentModule: '',
          options: identifier.options,
        });
        break;
    }
  }

  for (const mod of modules) {
    mod.domain = inferDomain(mod.indexPath, domains);
  }

  const plainModules = modules.filter(m => !m.domain);
  const domainModules = modules.filter(m => m.domain);

  for (const plain of plainModules) {
    const conflict = domainModules.find(dm => dm.name === plain.name);
    if (conflict) {
      throw new KerithError(
        'MODULE_SPACE_CONFLICT',
        `Module name conflict: "${plain.name}" exists in both flat space ("${plain.dirPath}") and domain space ("${conflict.dirPath}").`,
        `Rename one of the modules or move both into domains.`
      );
    }
  }

  const resolvedSubmodules: SubModuleScanEntry[] = [];
  for (const sub of submodules) {
    const parentModule = inferParentModule(sub.indexPath, modules);
    if (!parentModule) {
      log?.(
        'warn',
        `[Kerith] SubModule "${sub.name}" at "${sub.dirPath}" has no parent module — skipped`,
        { _module: 'scanner', name: sub.name, path: sub.dirPath },
      );
      continue;
    }
    sub.parentModule = parentModule;
    sub.domain = inferDomain(sub.indexPath, domains);
    resolvedSubmodules.push(sub);
  }

  const shared = await detectSharedEntries(absoluteOrigin, domains, log);

  return {
    domains,
    modules,
    submodules: resolvedSubmodules,
    shared,
  };
}

// ─── Legacy modules glob (v1.x) ──────────────────────────────────────────────

export async function scanModulesLegacy(
  modulesGlob: string,
  cwd: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const ignore = options.ignore ?? [...DEFAULT_SCAN_IGNORE];
  const globPattern = modulesGlob.replace(/\\/g, '/');

  const moduleDirs = await fg(globPattern, {
    onlyDirectories: true,
    absolute: true,
    cwd,
    ignore,
  });

  moduleDirs.sort();

  const modules: ModuleScanEntry[] = [];

  for (const dirPath of moduleDirs) {
    const indexPath = resolveIndexFile(dirPath);
    if (!indexPath) {
      throw new KerithError(
        'MODULE_NOT_FOUND',
        `No index.ts or index.js found for module. A module directory must have an index file mapping its dependencies.`,
        `Directory: ${dirPath}`,
      );
    }

    const identifier = await extractTopLevelIdentifier(indexPath);
    if (identifier?.type === 'Module') {
      modules.push({
        name: identifier.name,
        dirPath,
        indexPath,
        imports: stringArrayOption(identifier.options.imports),
        exports: stringArrayOption(identifier.options.exports),
        shared: stringArrayOption(identifier.options.shared),
        options: identifier.options,
      });
    } else {
      modules.push({
        name: path.basename(dirPath),
        dirPath,
        indexPath,
        imports: [],
        exports: [],
        shared: [],
        options: {},
      });
    }
  }

  const modulesBase = globPattern.split('*')[0].replace(/\/$/, '');
  const scanRoot = path.resolve(cwd, path.dirname(modulesBase) || modulesBase);
  const shared = await detectSharedEntries(scanRoot, [], options.log);

  return {
    domains: [],
    modules,
    submodules: [],
    shared,
  };
}

// ─── Config entry point (bootstrap) ──────────────────────────────────────────

/**
 * Scans the project filesystem according to `kerith.config`.
 * Does not touch the registry — returns structured discovery data only.
 */
export async function scanFromConfig(
  config: KerithConfig,
  cwd: string,
  log?: LogHandler,
  domainsToScan?: string[]
): Promise<ScanResult> {
  const options: ScanOptions = { cwd, log, domainsToScan };

  if (config.origin) {
    const originPath = path.resolve(cwd, config.origin);
    return scanOrigin(originPath, options);
  }

  if (config.modules) {
    return scanModulesLegacy(config.modules, cwd, options);
  }

  return {
    domains: [],
    modules: [],
    submodules: [],
    shared: [],
  };
}

/**
 * Maps scan modules to the shape consumed by the bootstrap pipeline.
 */
export function scanModulesToResolved(
  scan: ScanResult,
): { name: string; dirPath: string; indexPath: string; domain?: string }[] {
  return scan.modules.map((mod) => ({
    name: mod.name,
    dirPath: mod.dirPath,
    indexPath: mod.indexPath,
    domain: mod.domain,
  }));
}
