import type { ModuleGraph } from './graph-builder.js';
import { ViolationType, type Violation } from './violations.js';
import type { ResolvedQualityRules } from '../../config/rules.types.js';

/**
 * Detects modules that declare exports[] identifiers that no other module
 * consumes via its imports[] declaration.
 *
 * Only checks Kerith declaration-level metadata (Module() options).
 * Does not verify runtime usage via @domain aliases.
 */
export function detectUnusedExports(
  graph: ModuleGraph,
  rules: ResolvedQualityRules
): Violation[] {
  if (!rules.unusedExports) return [];

  // Build a set of every identifier consumed by any module's imports[].
  const consumedByImports = new Set<string>();
  for (const mod of graph.modules) {
    for (const imp of mod.declaredImports) {
      consumedByImports.add(imp);
    }
  }

  const violations: Violation[] = [];

  for (const mod of graph.modules) {
    for (const exportedId of mod.declaredExports) {
      if (!consumedByImports.has(exportedId)) {
        violations.push({
          type: ViolationType.UNUSED_EXPORT,
          module: mod.name,
          severity: 'warn',
          message: `'${exportedId}' is declared in exports[] but no module imports it`,
          suggestion: `Consider removing '${exportedId}' from exports[] or verify that the consuming module declares it in imports[]`,
        });
      }
    }
  }

  return violations;
}

/**
 * Detects modules with no identifiers registered in NITS
 * (i.e. no Service(), Repository(), Controller(), etc. found by the AST scanner).
 *
 * @future Modules marked as `placeholder` (v2.x API) will be excluded from this check.
 */
export function detectEmptyModules(
  graph: ModuleGraph,
  rules: ResolvedQualityRules
): Violation[] {
  if (!rules.emptyModule) return [];

  const violations: Violation[] = [];

  for (const mod of graph.modules) {
    if (mod.internalIdentifiers.length === 0) {
      violations.push({
        type: ViolationType.EMPTY_MODULE,
        module: mod.name,
        severity: 'warn',
        message: `'${mod.name}' has no registered identifiers`,
        suggestion: `Add at least one Service(), Repository(), or Controller() to the module`,
      });
    }
  }

  return violations;
}
