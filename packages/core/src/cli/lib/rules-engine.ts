import { findCircularDependencies } from '../../core/utils/cycle-detector.js';
import { detectDepthViolations } from './depth-checker.js';
import { detectSizeViolations } from './size-checker.js';
import { detectUnusedExports, detectEmptyModules } from './export-checker.js';
import {
  detectCouplingWarnings,
  ViolationType,
  type Violation,
  type StandardViolation,
} from './violations.js';
import type { ModuleGraph } from './graph-builder.js';
import type { ResolvedQualityRules } from '../../config/rules.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely runs a detector. If it throws, returns an empty array and emits a
 * warning so the rest of the engine continues unaffected.
 */
function safeRun(name: string, fn: () => Violation[]): Violation[] {
  try {
    return fn();
  } catch (err) {
    // Engine is pure — no external logger injected.
    // Emit to stderr so it doesn't pollute structured output.
    process.stderr.write(`[rules-engine] ${name} detector failed: ${err}\n`);
    return [];
  }
}

/**
 * Adapts ResolvedQualityRules to the coupling config shape that
 * detectCouplingWarnings currently expects (legacy API from Parte 4).
 * Returns only the warnings array — fanInMap/fanOutMap are reporter concerns.
 */
function runCouplingDetector(
  graph: ModuleGraph,
  rules: ResolvedQualityRules
): Violation[] {
  const fanOutThreshold = rules.fanOutThreshold ?? Number.MAX_SAFE_INTEGER;
  const fanInThreshold  = rules.fanInThreshold  ?? Number.MAX_SAFE_INTEGER;

  const { warnings } = detectCouplingWarnings(graph, {
    coupling: {
      fanOut: { threshold: fanOutThreshold === null ? Number.MAX_SAFE_INTEGER : fanOutThreshold },
      fanIn:  { threshold: fanInThreshold  === null ? Number.MAX_SAFE_INTEGER : fanInThreshold  },
    },
  });

  return warnings;
}

/**
 * Detects circular dependency cycles between modules and returns them as
 * Violation objects with severity 'warn'.
 *
 * Extracted from the inline logic in detectViolations() — the engine owns
 * this check independently so it can be skipped via rules.circularDependency.
 */
function runCircularDetector(graph: ModuleGraph): Violation[] {
  const dependencyMap = new Map<string, string[]>();
  for (const node of graph.modules) {
    dependencyMap.set(node.name, node.declaredImports);
  }

  const cycles = findCircularDependencies(dependencyMap);
  return cycles.map((cycle): StandardViolation => ({
    type: ViolationType.CIRCULAR_DEPENDENCY,
    severity: 'warn',
    module: cycle[0],
    message: `Circular dependency detected: ${cycle.join(' -> ')}`,
    suggestion: 'Extract shared logic into a separate module to break the cycle.',
    cycle,
  }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs all configured quality rules against the module graph.
 *
 * - Pure: no side effects, no file writes, no external logging.
 * - Isolated: each detector runs inside safeRun() so a single failure
 *   does not abort the rest of the analysis.
 * - Extensible: new detectors are added here, not in the check command.
 */
export function runQualityRules(
  graph: ModuleGraph,
  rules: ResolvedQualityRules
): Violation[] {
  const results: Violation[] = [];

  // Depth
  results.push(...safeRun('depth', () => detectDepthViolations(graph.modules, rules)));

  // Size (files + submodules count)
  results.push(...safeRun('size', () => detectSizeViolations(graph.modules, graph.submodules, rules)));

  // Exports
  results.push(...safeRun('unusedExports', () => detectUnusedExports(graph, rules)));
  results.push(...safeRun('emptyModule',   () => detectEmptyModules(graph, rules)));

  // Coupling (fan-out / fan-in)
  results.push(...safeRun('coupling', () => runCouplingDetector(graph, rules)));

  // Circular dependencies — optional, controlled by rules.circularDependency
  if (rules.circularDependency) {
    results.push(...safeRun('circular', () => runCircularDetector(graph)));
  }

  return results;
}
