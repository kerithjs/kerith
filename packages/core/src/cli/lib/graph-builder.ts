import fg from 'fast-glob';
import path from 'node:path';

import { 
  extractIdentifierCall
} from './ast-parser.js';
import {
  buildActiveAliasesFromConfig,
  extractModuleImports,
  type ImportFound,
} from './import-scanner.js';
import type { KerithConfig } from '../../config/kerith-config.types.js';
import { scanFromConfig } from '../../bootstrap/scanner.js';

export interface BaseNode {
  name: string;
  dirPath: string;
  indexPath: string;
  declaredImports: string[];
  actualImports: ImportFound[];
  internalIdentifiers: string[];
}

export interface ModuleNode extends BaseNode {
  id?: string;
  domain?: string;
  submodules?: string[];
  /** How identity was resolved in the last NITS reconciliation cycle. @since v1.5.5 */
  resolvedBy?: 'shadow-file' | 'path' | 'jaccard';
}

export interface SubModuleNode extends BaseNode {
  parentModule: string;
  domain?: string;
}

export interface DomainNode {
  name: string;
  dirPath: string;
  indexPath: string;
  modules: ModuleNode[];
}

export interface ModuleGraph {
  domains: DomainNode[];
  modules: ModuleNode[];
  submodules: SubModuleNode[];
}

export async function buildModuleGraph(config: KerithConfig, cwd: string): Promise<ModuleGraph> {
  const scanResult = await scanFromConfig(config, cwd);
  const moduleNames = scanResult.modules.map(m => m.name);
  const domainNames = scanResult.domains.map(d => d.name);
  const activeAliases = buildActiveAliasesFromConfig(config, moduleNames, domainNames);

  // ─── Single global glob (O(1) filesystem traversal) ──────────────────────
  // Collect ALL source files across the whole project once, then filter
  // in-memory per module/submodule. This avoids the O(n) glob-per-module
  // pattern that was hurting performance on large projects.
  const allSourceFiles = await fg('**/*.{ts,js,mts,mjs}', {
    cwd,
    absolute: true,
    onlyFiles: true,
    ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/node_modules/**'],
  });

  // Pre-normalise paths once so the hot-path startsWith() comparisons are cheap.
  const allSourceFilesNorm = allSourceFiles.map(f => ({ abs: f, norm: path.normalize(f) }));

  function getFilesUnderDir(dirPath: string): string[] {
    const normDir = path.normalize(dirPath) + path.sep;
    return allSourceFilesNorm
      .filter(f => f.norm.startsWith(normDir))
      .map(f => f.abs);
  }

  const targetCallees = ['Service', 'Repository', 'Schema'];

  function buildNodeData(
    dirPath: string,
    indexPath: string,
  ): { actualImports: ImportFound[]; internalIdentifiers: string[] } {
    const actualImports: ImportFound[] = [];
    const internalIdentifiers: string[] = [];

    // Index file is scanned separately for identifier calls (not for imports).
    for (const callee of targetCallees) {
      const result = extractIdentifierCall(indexPath, callee);
      if (result) internalIdentifiers.push(result.name);
    }

    // Filter the global file list — no extra I/O.
    const moduleFiles = getFilesUnderDir(dirPath).filter(f => {
      const rel = path.relative(path.normalize(dirPath), path.normalize(f));
      // Exclude index files (same as before).
      return !rel.match(/^index\./);
    });

    for (const file of moduleFiles) {
      const fileImports = extractModuleImports(file, activeAliases);
      actualImports.push(...fileImports);

      for (const callee of targetCallees) {
        const result = extractIdentifierCall(file, callee);
        if (result) internalIdentifiers.push(result.name);
      }
    }

    return { actualImports, internalIdentifiers };
  }

  const nodes: ModuleNode[] = [];
  for (const mod of scanResult.modules) {
    const { actualImports, internalIdentifiers } = buildNodeData(mod.dirPath, mod.indexPath);

    const submodules = scanResult.submodules
      .filter(sub => sub.parentModule === mod.name && sub.domain === mod.domain)
      .map(sub => sub.name);

    nodes.push({
      name: mod.name,
      dirPath: mod.dirPath,
      indexPath: mod.indexPath,
      domain: mod.domain,
      submodules: submodules.length > 0 ? submodules : undefined,
      declaredImports: mod.imports,
      actualImports,
      internalIdentifiers,
    });
  }

  const subNodes: SubModuleNode[] = [];
  for (const sub of scanResult.submodules) {
    const { actualImports, internalIdentifiers } = buildNodeData(sub.dirPath, sub.indexPath);
    subNodes.push({
      name: sub.name,
      dirPath: sub.dirPath,
      indexPath: sub.indexPath,
      parentModule: sub.parentModule,
      domain: sub.domain,
      declaredImports: [], // SubModules do not declare imports
      actualImports,
      internalIdentifiers,
    });
  }

  const domainNodes: DomainNode[] = scanResult.domains.map(d => ({
    name: d.name,
    dirPath: d.dirPath,
    indexPath: d.indexPath,
    modules: nodes.filter(m => m.domain === d.name),
  }));

  return {
    domains: domainNodes,
    modules: nodes,
    submodules: subNodes,
  };
}
