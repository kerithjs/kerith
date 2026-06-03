import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { KerithConfig } from '../config/kerith-config.types.js';
import type { LogHandler } from '../types/index.js';
import { extractTopLevelIdentifier } from '../cli/lib/ast-parser.js';
import { normalizePath } from '../core/utils/paths.js';
import { KerithError } from '../core/errors.js';

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

export interface SharedScanEntry {
  type: 'domain-scoped' | 'global';
  alias: string;
  path: string;
}

export interface ScanResult {
  domains: DomainScanEntry[];
  modules: ModuleScanEntry[];
  submodules: SubModuleScanEntry[];
  shared: SharedScanEntry[];
}

export interface ScanOptions {
  cwd?: string;
  ignore?: string[];
  log?: LogHandler;
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

function isPathUnder(parentDir: string, childPath: string): boolean {
  const parent = normalizePath(path.resolve(parentDir));
  const child = normalizePath(path.resolve(childPath));
  if (child === parent) return true;
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function stringArrayOption(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

// ─── Hierarchy inference ─────────────────────────────────────────────────────

export function inferDomain(
  filePath: string,
  domains: DomainScanEntry[],
): string | undefined {
  const sorted = [...domains].sort((a, b) => b.dirPath.length - a.dirPath.length);
  for (const domain of sorted) {
    if (isPathUnder(domain.dirPath, filePath)) {
      return domain.name;
    }
  }
  return undefined;
}

export function inferParentModule(
  filePath: string,
  modules: ModuleScanEntry[],
): string | undefined {
  const subModuleDir = normalizePath(path.dirname(path.resolve(filePath)));
  const parentDir = normalizePath(path.dirname(subModuleDir));
  const sorted = [...modules].sort((a, b) => b.dirPath.length - a.dirPath.length);
  for (const mod of sorted) {
    const modDir = normalizePath(path.resolve(mod.dirPath));
    if (parentDir === modDir) {
      return mod.name;
    }
  }
  return undefined;
}

// ─── Shared detection ────────────────────────────────────────────────────────

async function detectSharedEntries(
  scanRoot: string,
  domains: DomainScanEntry[],
): Promise<SharedScanEntry[]> {
  const shared: SharedScanEntry[] = [];

  for (const domain of domains) {
    const sharedPath = path.join(domain.dirPath, '_shared');
    if (fs.existsSync(sharedPath) && fs.statSync(sharedPath).isDirectory()) {
      shared.push({
        type: 'domain-scoped',
        alias: `@${domain.name}/shared`,
        path: sharedPath,
      });
    }
  }

  const globalShared = path.join(scanRoot, 'shared');
  if (fs.existsSync(globalShared) && fs.statSync(globalShared).isDirectory()) {
    shared.push({
      type: 'global',
      alias: '@shared',
      path: globalShared,
    });
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
  const globPattern = path
    .join(absoluteOrigin, '**', 'index.{ts,js,mts,mjs}')
    .replace(/\\/g, '/');

  const indexFiles = await fg(globPattern, {
    absolute: true,
    cwd: options.cwd ?? process.cwd(),
    ignore,
  });

  const domains: DomainScanEntry[] = [];
  const modules: ModuleScanEntry[] = [];
  const submodules: SubModuleScanEntry[] = [];
  const log = options.log;

  for (const indexPath of indexFiles) {
    const identifier = extractTopLevelIdentifier(indexPath);
    if (!identifier) {
      continue;
    }

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

  const shared = await detectSharedEntries(absoluteOrigin, domains);

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

    const identifier = extractTopLevelIdentifier(indexPath);
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
  const shared = await detectSharedEntries(scanRoot, []);

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
): Promise<ScanResult> {
  const options: ScanOptions = { cwd, log };

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
