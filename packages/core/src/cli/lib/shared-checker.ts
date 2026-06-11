import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { ModuleGraph, ModuleNode, SubModuleNode } from './graph-builder.js';
import type { Violation } from './violations.js';
import { ViolationType } from './violations.js';
import { extractModuleImports } from './import-scanner.js';
import type { InternalRegistry } from '../../core/registry.js';

/**
 * Checks for shared access violations across the module graph.
 */
export async function checkSharedAccess(
  graph: ModuleGraph,
  registry: InternalRegistry,
  cwd: string = process.cwd(),
): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Build a map of module name -> node for quick lookup
  const moduleMap = new Map<string, ModuleNode>();
  for (const mod of graph.modules) {
    moduleMap.set(mod.name, mod);
  }

  // Build a map of file path -> module node for domain resolution
  const fileToModule = new Map<string, ModuleNode | SubModuleNode>();
  for (const mod of graph.modules) {
    const files = getModuleFiles(mod.dirPath);
    for (const file of files) {
      fileToModule.set(file, mod);
    }
  }
  for (const sub of graph.submodules) {
    const files = getModuleFiles(sub.dirPath);
    for (const file of files) {
      fileToModule.set(file, sub);
    }
  }

  // Get all registered domains
  const domainNames = new Set(graph.domains.map(d => d.name));

  // ─── Step A: Detect UNDECLARED_SHARED ───────────────────────────────────────
  for (const mod of graph.modules) {
    const _declaredShared = mod.declaredImports.filter(imp => imp.startsWith('@shared'));
    const files = getModuleFiles(mod.dirPath);

    for (const file of files) {
      const imports = extractModuleImports(file, ['@shared']);
      for (const imp of imports) {
        if (imp.specifier.startsWith('@shared')) {
          // Check if @shared is declared in shared[] (which is stored in declaredImports for now)
          // Note: shared[] is not yet in ModuleNode, we need to check the registry
          const rawModule = registry.getRawModule(mod.name, mod.domain);
          const moduleShared = rawModule?.shared || [];
          
          if (!moduleShared.some((s: string) => imp.specifier === s || imp.specifier.startsWith(s + '/'))) {
            violations.push({
              type: ViolationType.UNDECLARED_SHARED,
              module: mod.name,
              message: `Module "${mod.name}" imports from "${imp.specifier}" but does not declare it in shared[].`,
              suggestion: `Add "${imp.specifier}" to shared[] in Module("${mod.name}").`,
              location: { file: path.relative(cwd, file).replace(/\\/g, '/'), line: imp.line },
            });
          }
        }
      }
    }
  }

  // ─── Step B: Detect UNUSED_SHARED ───────────────────────────────────────────
  for (const mod of graph.modules) {
    const rawModule = registry.getRawModule(mod.name, mod.domain);
    const moduleShared = rawModule?.shared || [];
    
    if (moduleShared.length === 0) continue;

    const files = getModuleFiles(mod.dirPath);
    const submodules = graph.submodules.filter(s => s.parentModule === mod.name && (s.domain === mod.domain || (!s.domain && !mod.domain)));
    for (const sub of submodules) {
      files.push(...getModuleFiles(sub.dirPath));
    }
    const usedShared = new Set<string>();

    for (const file of files) {
      const imports = extractModuleImports(file, ['@shared']);
      for (const imp of imports) {
        if (imp.specifier.startsWith('@shared')) {
          // Mark which shared entries are used
          for (const sharedDecl of moduleShared) {
            if (imp.specifier === sharedDecl || imp.specifier.startsWith(sharedDecl + '/')) {
              usedShared.add(sharedDecl);
            }
          }
        }
      }
    }

    for (const sharedDecl of moduleShared) {
      if (!usedShared.has(sharedDecl)) {
        violations.push({
          type: ViolationType.UNUSED_SHARED,
          module: mod.name,
          message: `Module "${mod.name}" declares "${sharedDecl}" in shared[] but never imports from it.`,
          suggestion: `Remove "${sharedDecl}" from shared[] in Module("${mod.name}").`,
        });
      }
    }
  }

  // ─── Step C: Detect SHARED_SCOPE_VIOLATION ─────────────────────────────────
  // Scan all files for @{domain}/shared imports
  const allSourceFiles = fg.sync('**/*.{ts,js,mts,mjs}', {
    cwd,
    absolute: true,
    onlyFiles: true,
    ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/node_modules/**'],
  });

  for (const file of allSourceFiles) {
    const imports = extractModuleImports(file);
    for (const imp of imports) {
      // Check if it's a domain-scoped shared import
      const match = imp.specifier.match(/^@([^/]+)\/shared/);
      if (match) {
        const targetDomain = match[1];
        
        // Check if it's a registered domain
        if (domainNames.has(targetDomain)) {
          const sourceNode = fileToModule.get(file);
          if (!sourceNode) continue;

          const sourceDomain = sourceNode.domain;
          
          // Flat space modules (no domain) cannot access domain-scoped shared
          // Modules from other domains cannot access this domain's shared
          if (sourceDomain !== targetDomain) {
            violations.push({
              type: ViolationType.SHARED_SCOPE_VIOLATION,
              module: sourceNode.name,
              message: `'@${targetDomain}/shared' is only available within the '${targetDomain}' domain.`,
              suggestion: `Move this resource to '@shared' global if it needs to be cross-domain.`,
              location: { file: path.relative(cwd, file).replace(/\\/g, '/'), line: imp.line },
            });
          }
        }
      }
    }
  }

  // ─── Step D: SubModules inherit from parent ─────────────────────────────────
  for (const sub of graph.submodules) {
    const parentNode = moduleMap.get(sub.parentModule);
    if (!parentNode) continue;

    const rawParent = registry.getRawModule(parentNode.name, parentNode.domain);
    const parentShared = rawParent?.shared || [];

    const files = getModuleFiles(sub.dirPath);
    for (const file of files) {
      const imports = extractModuleImports(file, ['@shared']);
      for (const imp of imports) {
        if (imp.specifier.startsWith('@shared')) {
          // Check if parent has @shared declared
          const isDeclared = parentShared.some((s: string) => imp.specifier === s || imp.specifier.startsWith(s + '/'));
          
          if (!isDeclared) {
            violations.push({
              type: ViolationType.UNDECLARED_SHARED,
              module: parentNode.name, // Report on parent, not submodule
              message: `Module "${parentNode.name}" (parent of submodule "${sub.name}") imports from "${imp.specifier}" but does not declare it in shared[].`,
              suggestion: `Add "${imp.specifier}" to shared[] in Module("${parentNode.name}").`,
              location: { file: path.relative(cwd, file).replace(/\\/g, '/'), line: imp.line },
            });
          }
        }
      }
    }
  }

  return violations;
}

/** Lists source files under a module directory (excludes tests and declaration files). */
function getModuleFiles(moduleDirPath: string): string[] {
  if (!fs.existsSync(moduleDirPath)) {
    return [];
  }
  try {
    return fg.sync('**/*.{ts,js,mts,mjs}', {
      cwd: moduleDirPath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
    });
  } catch {
    return [];
  }
}
