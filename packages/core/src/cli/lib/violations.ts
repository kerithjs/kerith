import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { ModuleGraph } from './graph-builder.js';
import { extractRelativeCrossModuleImports } from './import-scanner.js';
import { findCircularDependencies } from '../../core/utils/cycle-detector.js';

export const ViolationType = {
  PRIVATE_IMPORT: 'private-import',
  UNDECLARED_IMPORT: 'undeclared-import',
  CIRCULAR_DEPENDENCY: 'circular-dependency',
  RELATIVE_BOUNDARY_VIOLATION: 'relative-boundary-violation',
  DOMAIN_BOUNDARY_VIOLATION: 'domain-boundary-violation',
  SUBMODULE_DIRECT_SIBLING: 'submodule-direct-sibling',
  SUBMODULE_DOMAIN_BYPASS: 'submodule-domain-bypass',
  MODULE_SPACE_CONFLICT: 'module-space-conflict',
  UNDECLARED_SHARED: 'undeclared-shared',
  UNUSED_SHARED: 'unused-shared',
  SHARED_SCOPE_VIOLATION: 'shared-scope-violation',
} as const;

export type ViolationType = typeof ViolationType[keyof typeof ViolationType];

/** REGLA-45 / Fase 6 — always forces exit 1 in `kerith check`. */
export interface RelativeBoundaryViolation {
  type: typeof ViolationType.RELATIVE_BOUNDARY_VIOLATION;
  severity: 'error' | 'warn';
  module: string;
  file: string;
  line?: number;
  import: string;
  hint: string;
}

export interface StandardViolation {
  type: Exclude<
    ViolationType,
    typeof ViolationType.RELATIVE_BOUNDARY_VIOLATION
  >;
  severity: 'error' | 'warn';
  module: string;
  message: string;
  suggestion: string;
  location?: { file: string; line: number };
  cycle?: string[];
}

export type Violation = RelativeBoundaryViolation | StandardViolation;

const BOUNDARY_HINT =
  'Use the alias @modules/<module> to import from another module.';

/** Lists source files under a module directory (excludes tests and declaration files). */
export function getModuleFiles(moduleDirPath: string): string[] {
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

/**
 * @deprecated Use isHardViolation(v) instead.
 */
export function isErrorViolation(violation: Violation): boolean {
  return isHardViolation(violation);
}

export function isHardViolation(violation: Violation): boolean {
  return violation.severity === 'error';
}

/**
 * Scans every file in each module for relative imports that escape the module boundary.
 */
export function detectRelativeBoundaryViolations(
  graph: ModuleGraph,
  cwd: string = process.cwd(),
): RelativeBoundaryViolation[] {
  const violations: RelativeBoundaryViolation[] = [];

  const allNodes = [...graph.modules, ...(graph.submodules || [])];

  for (const moduleNode of allNodes) {
    const files = getModuleFiles(moduleNode.dirPath);

    for (const file of files) {
      const crossModuleImports = extractRelativeCrossModuleImports(
        file,
        moduleNode.dirPath,
      );

      for (const { specifier, line } of crossModuleImports) {
        violations.push({
          type: ViolationType.RELATIVE_BOUNDARY_VIOLATION,
          severity: 'error',
          module: moduleNode.name,
          file: path.relative(cwd, file).replace(/\\/g, '/'),
          line,
          import: specifier,
          hint: BOUNDARY_HINT,
        });
      }
    }
  }

  return violations;
}

/**
 * Heuristic to detect private imports and extract target module names.
 * Covers: @modules/name, @domain/module, @domain patterns.
 */
function analyzeImport(specifier: string): { isPrivate: boolean; suggestion: string; target: string } {
  const parts = specifier.split('/');
  const isModules = specifier.startsWith('@modules/');
  const isAtAlias = specifier.startsWith('@');

  if (isModules) {
    if (parts.length > 2) {
      return { isPrivate: true, suggestion: `${parts[0]}/${parts[1]}`, target: parts[1] };
    }
    return { isPrivate: false, suggestion: '', target: parts[1] };
  }

  if (isAtAlias) {
    if (parts.length > 2) {
      return { isPrivate: true, suggestion: `${parts[0]}/${parts[1]}`, target: parts[1] };
    }
    const target = (parts[1] || parts[0]).replace(/^@/, '');
    return { isPrivate: false, suggestion: '', target };
  }

  return { isPrivate: false, suggestion: '', target: '' };
}

export function detectViolations(
  graph: ModuleGraph,
  cwd: string = process.cwd(),
): Violation[] {
  const violations: Violation[] = [
    ...detectRelativeBoundaryViolations(graph, cwd),
  ];
  const nodes = graph.modules;
  const subNodes = graph.submodules || [];
  const allNodes = [...nodes, ...subNodes];
  const moduleNames = new Set(nodes.map(n => n.name));

  if (graph.domains) {
    for (const d of graph.domains) {
      moduleNames.add(d.name);
    }
  }

  for (const node of allNodes) {
    for (const imp of node.actualImports) {
      if (imp.specifier.startsWith('./') || imp.specifier.startsWith('../')) {
        continue;
      }

      // 1. DOMAIN_BOUNDARY_VIOLATION
      // Patterns:
      //   @domain              → public API of the domain (always allowed from outside)
      //   @domain/module       → internal module alias  (parts.length === 2)
      //   @domain/module/path  → deep private sub-path   (parts.length > 2, also caught by PRIVATE_IMPORT)
      //
      // Rule: @domain/X is a violation when the importer lives outside that domain.
      //       Importers in the SAME domain may cross-reference sibling modules via
      //       @domain/siblingModule — that is intentional and NOT a violation here.
      if (imp.specifier.startsWith('@') && !imp.specifier.startsWith('@modules/')) {
        const parts = imp.specifier.split('/');
        const targetDomain = parts[0].slice(1); // strip leading '@'

        // Only fire when the specifier drills into a specific module inside the domain.
        // A bare `@domain` import is the public surface and is always valid from outside.
        if (
          parts.length > 1 &&
          graph.domains?.some(d => d.name === targetDomain) &&
          node.domain !== targetDomain
        ) {
          const isDeepPath = parts.length > 2;
          const suggestion = isDeepPath
            ? `Import only the public index '@${targetDomain}/${parts[1]}' or the domain root '@${targetDomain}'`
            : `Import from the domain root '@${targetDomain}' instead of the internal alias '${imp.specifier}'`;

          violations.push({
            type: ViolationType.DOMAIN_BOUNDARY_VIOLATION,
            severity: 'error',
            module: node.name,
            message: `Domain boundary violation: module "${node.name}" (domain: ${node.domain ?? 'none'}) imports from internal domain alias "${imp.specifier}" (domain: ${targetDomain}).`,
            suggestion,
            location: { file: imp.file, line: imp.line },
          });
        }
      }

      // 2. SUBMODULE_DIRECT_SIBLING
      if (imp.specifier.includes('/submodules/')) {
        const parts = imp.specifier.split('/submodules/');
        const sibling = parts[1];
        if ('parentModule' in node && sibling) {
          const parentAlias = parts[0];
          violations.push({
            type: ViolationType.SUBMODULE_DIRECT_SIBLING,
            severity: 'warn',
            module: node.name,
            message: `Direct sibling access: submodule "${node.name}" directly imports sibling submodule "${sibling}".`,
            suggestion: `Access '${sibling}' through the parent module '${parentAlias}'`,
            location: { file: imp.file, line: imp.line },
          });
        }
      }

      // 3. SUBMODULE_DOMAIN_BYPASS
      // Intentional scope: only fires for the bare domain root alias `@{domain}`.
      //
      // Why NOT `@{domain}/X` (e.g. `@billing/payments`)?
      //   A submodule importing `@billing/payments` is already caught by
      //   DOMAIN_BOUNDARY_VIOLATION (check 1 above) when `node.domain !== targetDomain`,
      //   or by PRIVATE_IMPORT / UNDECLARED_IMPORT for deeper sub-paths.
      //   Duplicating the logic here would create redundant violations for the same
      //   import and confuse the developer with two different error codes.
      //
      // The specific case this rule catches: a submodule importing the root domain
      // barrel (`@billing`) from *within* that domain, which bypasses the parent
      // module abstraction entirely.
      if ('parentModule' in node && node.domain) {
        if (imp.specifier === `@${node.domain}`) {
          violations.push({
            type: ViolationType.SUBMODULE_DOMAIN_BYPASS,
            severity: 'warn',
            module: node.name,
            message: `Domain bypass: submodule "${node.name}" directly imports its own domain root "@${node.domain}".`,
            suggestion: `Access domain resources through the parent module "@modules/${node.parentModule}" instead of the domain root.`,
            location: { file: imp.file, line: imp.line },
          });
        }
      }

      const { isPrivate, suggestion, target } = analyzeImport(imp.specifier);

      if (isPrivate) {
        violations.push({
          type: ViolationType.PRIVATE_IMPORT,
          severity: 'warn',
          module: node.name,
          message: `Private import detected: module "${node.name}" directly imports internal path from "${imp.specifier}".`,
          suggestion: `Import only the public index: "${suggestion}".`,
          location: { file: imp.file, line: imp.line },
        });
      } else if (target && target !== node.name && moduleNames.has(target)) {
        if (!node.declaredImports.includes(target)) {
          violations.push({
            type: ViolationType.UNDECLARED_IMPORT,
            severity: 'warn',
            module: node.name,
            message: `Undeclared import: module "${node.name}" imports from "${target}" but it is not declared.`,
            suggestion: `Add "${target}" to the imports array in the Module() declaration of "${node.name}".`,
            location: { file: imp.file, line: imp.line },
          });
        }
      }
    }
  }

  const dependencyMap = new Map<string, string[]>();
  for (const node of nodes) {
    dependencyMap.set(node.name, node.declaredImports);
  }

  const cycles = findCircularDependencies(dependencyMap);
  for (const cycle of cycles) {
    const cycleStr = cycle.join(' -> ');
    violations.push({
      type: ViolationType.CIRCULAR_DEPENDENCY,
      severity: 'error',
      module: cycle[0],
      message: `Circular dependency detected: ${cycleStr}`,
      suggestion: 'Extract shared logic into a separate module to break the cycle.',
      cycle,
    });
  }

  // 4. MODULE_SPACE_CONFLICT
  const nameToDomains = new Map<string, Set<string | undefined>>();
  for (const node of nodes) {
    if (!nameToDomains.has(node.name)) {
      nameToDomains.set(node.name, new Set());
    }
    nameToDomains.get(node.name)!.add(node.domain);
  }

  for (const [name, domainSet] of nameToDomains.entries()) {
    if (domainSet.has(undefined) && domainSet.size > 1) {
      violations.push({
        type: ViolationType.MODULE_SPACE_CONFLICT,
        severity: 'warn',
        module: name,
        message: `Module space conflict: "${name}" exists in both flat space and domain space.`,
        suggestion: `Rename one of the modules. Cannot exist in both flat space and domain space.`,
      });
    }
  }

  return violations;
}
