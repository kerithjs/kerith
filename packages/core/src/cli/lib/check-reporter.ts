import type { ReconciliationResult } from '../../types/nits.js';
import type { Violation, RelativeBoundaryViolation, StandardViolation } from './violations.js';
import { ViolationType, isHardViolation } from './violations.js';
import { type ModuleNode as ModuleGraphNode, type DomainNode, type SubModuleNode } from './graph-builder.js';

const R    = '\x1b[0m';
const BOLD = '\x1b[1m';

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export const AYU = {
  fg:     fg(179, 177, 173),
  muted:  fg(138, 143, 152),
  dim:    fg(98,  106, 115),
  green:  fg(134, 179,   0),
  orange: fg(255, 143,  64),
  red:    fg(240, 113, 120),
  cyan:   fg( 57, 186, 230),
  lime:   fg(228, 242,  34),
} as const;

export function divider(): void {
  console.log(`  ${AYU.dim}${'─'.repeat(48)}${R}`);
}

export function sectionHeader(title: string, subtitle?: string): void {
  const sub = subtitle ? `  ${AYU.muted}(${subtitle})${R}` : '';
  console.log(`  ${AYU.fg}${title}${R}${sub}`);
}

export function blank(): void {
  console.log();
}

export interface CheckReportData {
  version:      string;
  projectName:  string;
  domains:      DomainNode[];
  modules:      ModuleGraphNode[];
  submodules:   SubModuleNode[];
  /** System violations — severity: 'error', always block. */
  violations:   Violation[];
  /** Quality warnings — severity: 'warn', only block with --strict. */
  qualityWarnings: Violation[];
  /** Resolved rule values used during this run (shown in JSON output). */
  resolvedRules?: Record<string, unknown>;
  nitsResult:   ReconciliationResult | null;
  /**
   * Map of shared alias → list of module names that declare it in shared[].
   * Populated in check.ts from the registry after entity registration.
   */
  sharedInfo?:  Record<string, string[]>;
  coupling?: {
    fanInMap:  Map<string, string[]>;
    fanOutMap: Map<string, number>;
  };
  options: {
    verbose:      boolean;
    strict:       boolean;
    moduleFilter?: string;
    levelFilter?:  string;
  };
}

export function printCheckReport(data: CheckReportData): void {
  printHeader(data);
  divider();
  
  if (data.options.verbose) {
    printArchitectureWithIdentity(data);
  } else {
    printArchitectureSection(data);
  }
  
  printSharedSection(data);
  printViolationDetails(data.violations, data);
  printQualityWarningsSection(data);
  
  if (!data.options.verbose) {
    printIdentitySection(data.nitsResult, data.modules);
  }
  
  divider();
  printSummary(data);
  printNextStep(data);
}

export function printHeader(data: CheckReportData): void {
  console.log(`  ${AYU.dim}▸${R} ${AYU.fg}Kerith${R} ${AYU.fg}${BOLD}v${data.version}${R}  ${AYU.dim}—  ${data.projectName}${R}`);
  blank();
}

export function printArchitectureSection(data: CheckReportData): void {
  sectionHeader('Architecture');
  
  const { domains, modules, submodules } = data;
  const hasDomains = domains && domains.length > 0;

  if (!hasDomains) {
    // v1.x mode (without sections)
    printNodeGroup(modules, data);
    blank();
    return;
  }

  const domainModules = modules.filter(m => m.domain);
  const flatModules = modules.filter(m => !m.domain);

  // Filter based on --level if present
  const level = data.options.levelFilter;

  if (!level || level === 'domain') {
    sectionHeader('Domains');
    printNodeGroup(domains, data);
    blank();
  }

  if ((!level || level === 'module') && domainModules.length > 0) {
    sectionHeader('Modules');
    printNodeGroup(domainModules, data);
    blank();
  }

  if ((!level || level === 'submodule') && submodules && submodules.length > 0) {
    sectionHeader('SubModules');
    printNodeGroup(submodules, data);
    blank();
  }

  if ((!level || level === 'flat') && flatModules.length > 0) {
    sectionHeader('Modules (flat)');
    printNodeGroup(flatModules, data);
    blank();
  }
}

function printNodeGroup(nodes: (ModuleGraphNode | DomainNode | SubModuleNode)[], data: CheckReportData): void {
  const getQualifiedName = (m: ModuleGraphNode | DomainNode | SubModuleNode) => {
    if ('parentModule' in m) return `${m.domain}/${m.parentModule}/${m.name}`; // SubModule
    if ('modules' in m) return m.name; // Domain
    return m.domain ? `${m.domain}/${m.name}` : m.name; // Module
  };
  
  if (nodes.length === 0) return;

  const maxLen = Math.min(30, Math.max(...nodes.map(m => getQualifiedName(m).length), 4));

  for (const mod of nodes) {
    const qualifiedName = getQualifiedName(mod);
    const modViolations = data.violations.filter(v => v.module === mod.name);
    const hasCircular = modViolations.some(v => v.type === ViolationType.CIRCULAR_DEPENDENCY);
    const boundaryViolations = modViolations.filter(
      (v): v is RelativeBoundaryViolation => v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION,
    );
    const _domainViolations = modViolations.filter(
      v => v.type === ViolationType.DOMAIN_BOUNDARY_VIOLATION,
    );
    const hasBoundary = boundaryViolations.length > 0;
    const isNew = data.nitsResult?.newModules?.some(n => n.name === mod.name) || false;
    
    let icon: string;
    let status: string;
    
    if (hasCircular) {
      icon = `${AYU.red}✗${R}`;
      status = `${AYU.red}circular dep${R}`;
    } else if (hasBoundary) {
      icon = `${AYU.red}✗${R}`;
      status = `${AYU.red}RELATIVE_BOUNDARY_VIOLATION${R}`;
    } else if (modViolations.length > 0) {
      icon = `${AYU.orange}⚠${R}`;
      status = `${AYU.orange}${modViolations.length} violation${modViolations.length === 1 ? '' : 's'}${R}`;
    } else if (isNew) {
      icon = `${AYU.cyan}◈${R}`;
      status = `${AYU.cyan}new${R}`;
    } else {
      icon = `${AYU.green}✔${R}`;
      status = `${AYU.green}OK${R}`;
    }

    const displayName = qualifiedName.length > 30 ? qualifiedName.slice(0, 29) + '…' : qualifiedName;
    const paddedName = displayName.padEnd(maxLen + 2, ' ');
    
    // For domains, we don't usually have violations logged against the domain name itself, but if we do, show them.
    // If it's a domain and has no violations, just print OK.
    if ('modules' in mod && modViolations.length > 0) {
       icon = `${AYU.red}✗${R}`;
       status = `${AYU.red}${modViolations.length} violation(s)${R}`;
    } else if ('modules' in mod) {
       icon = `${AYU.green}✔${R}`;
       status = `${AYU.green}OK${R}`;
    }

    console.log(`  ${icon}  ${AYU.fg}${paddedName}${R} ${status}`);

    // Print all violations for this node
    for (const v of modViolations) {
      if (v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION) {
        const bv = v as RelativeBoundaryViolation;
        const lineSuffix = bv.line !== undefined ? `:${bv.line}` : '';
        const fileBase = bv.file.split(/[/\\]/).pop() || bv.file;
        console.log(
          `       ${AYU.red}✗${R} ${AYU.dim}${fileBase}${lineSuffix}  →  import from '${bv.import}'${R}`,
        );
        console.log(`         ${AYU.dim}Suggestion: ${bv.hint}${R}`);
      } else {
        console.log(
          `       ${AYU.red}✗${R} ${AYU.red}${v.type}:${R} ${AYU.dim}${v.message}${R}`,
        );
        if (v.suggestion) {
          console.log(`         ${AYU.dim}Suggestion: ${v.suggestion}${R}`);
        }
      }
    }
  }
}

export function printArchitectureWithIdentity(data: CheckReportData): void {
  const domains = data.domains || [];
  const submodules = data.submodules || [];
  const modules = data.modules || [];
  const hasDomains = domains.length > 0;

  if (!hasDomains) {
    sectionHeader('Architecture + Identity');
    printNodeGroupWithIdentity(modules, data);
    blank();
    printIdentityLegend();
    return;
  }

  const domainModules = modules.filter(m => m.domain);
  const flatModules = modules.filter(m => !m.domain);
  const level = data.options.levelFilter;

  if (!level || level === 'domain') {
    sectionHeader('Domains + Identity');
    printNodeGroupWithIdentity(domains, data);
    blank();
  }

  if ((!level || level === 'module') && domainModules.length > 0) {
    sectionHeader('Modules + Identity');
    printNodeGroupWithIdentity(domainModules, data);
    blank();
  }

  if ((!level || level === 'submodule') && submodules && submodules.length > 0) {
    sectionHeader('SubModules + Identity');
    printNodeGroupWithIdentity(submodules, data);
    blank();
  }

  if ((!level || level === 'flat') && flatModules.length > 0) {
    sectionHeader('Modules (flat) + Identity');
    printNodeGroupWithIdentity(flatModules, data);
    blank();
  }

  printIdentityLegend();
}

function printNodeGroupWithIdentity(nodes: (ModuleGraphNode | DomainNode | SubModuleNode)[], data: CheckReportData): void {
  const getQualifiedName = (m: ModuleGraphNode | DomainNode | SubModuleNode) => {
    if ('parentModule' in m) return `${m.domain}/${m.parentModule}/${m.name}`; // SubModule
    if ('modules' in m) return m.name; // Domain
    return m.domain ? `${m.domain}/${m.name}` : m.name; // Module
  };
  
  if (nodes.length === 0) return;

  const maxLen = Math.min(30, Math.max(...nodes.map(m => getQualifiedName(m).length), 4));

  for (const mod of nodes) {
    const qualifiedName = getQualifiedName(mod);
    const modViolations = data.violations.filter(v => v.module === mod.name);
    const hasCircular = modViolations.some(v => v.type === ViolationType.CIRCULAR_DEPENDENCY);
    const hasBoundary = modViolations.some(
      v => v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION,
    );
    const isNew = data.nitsResult?.newModules?.some(n => n.name === mod.name) || false;
    
    let icon: string;
    
    if (hasCircular || hasBoundary || modViolations.length > 0) {
      icon = `${AYU.red}✗${R}`;
    } else if (isNew) {
      icon = `${AYU.cyan}◈${R}`;
    } else {
      icon = `${AYU.green}✔${R}`;
    }

    const displayName = qualifiedName.length > 30 ? qualifiedName.slice(0, 29) + '…' : qualifiedName;
    const paddedName = displayName.padEnd(maxLen + 2, ' ');
    const isModuleNode = !('modules' in mod) && !('parentModule' in mod);
    const idStr = isModuleNode ? (mod.id || 'unknown') : '—';
    const resolvedBy = isNew ? 'new' : (isModuleNode ? (mod.resolvedBy || 'unknown') : '—');
    
    let methodColored: string;
    let hint = '';
    
    const idDisplay = `[${idStr}`.padEnd(14, ' ');
    
    if (resolvedBy === 'new' || resolvedBy === 'path') {
       methodColored = `${AYU.cyan}${resolvedBy}${R}`;
       hint = resolvedBy === 'new' ? `  ${AYU.dim}— .kerith generated${R}` : '';
    } else if (resolvedBy === 'jaccard') {
       methodColored = `${AYU.orange}jaccard${R}`;
       hint = `  ${AYU.dim}— no .kerith file${R}`;
    } else if (resolvedBy === 'shadow-file') {
       methodColored = `${AYU.green}shadow-file${R}`;
    } else {
       methodColored = `${AYU.dim}${resolvedBy}${R}`;
    }
    
    const methodLength = resolvedBy.length;
    const methodPad = ' '.repeat(Math.max(0, 11 - methodLength));
    
    console.log(`  ${icon}  ${AYU.fg}${paddedName}${R} ${AYU.dim}${idDisplay}${R} ${methodColored}${methodPad}${AYU.dim}]${R}${hint}`);
  }
}

function printIdentityLegend(): void {
  sectionHeader('Identity legend');
  console.log(`  ${AYU.green}shadow-file${R}  ${AYU.dim}— resolved by .kerith ID  (100% confidence)${R}`);
  console.log(`  ${AYU.orange}jaccard${R}      ${AYU.dim}— resolved by similarity   (heuristic)${R}`);
  console.log(`  ${AYU.cyan}path${R}         ${AYU.dim}— resolved by path match   (new or legacy)${R}`);
  blank();
}

export function printViolationDetails(violations: Violation[], data: CheckReportData): void {
  if (violations.length === 0) return;

  const modulesWithViolations = Array.from(new Set(violations.map(v => v.module)));

  for (const moduleName of modulesWithViolations) {
    console.log(`  ${AYU.muted}${moduleName}${R}`);
    const moduleViolations = violations.filter(v => v.module === moduleName);

    for (const v of moduleViolations) {
      if (v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION) {
        const icon = `${AYU.red}✗${R}`;
        const lineSuffix = v.line !== undefined ? `:${v.line}` : '';
        const fileBase = v.file.split(/[/\\]/).pop() || v.file;
        console.log(`    ${icon}  ${AYU.fg}RELATIVE_BOUNDARY_VIOLATION${R}`);
        console.log(
          `       ${AYU.dim}${fileBase}${lineSuffix}  →  import from '${v.import}'${R}`,
        );
        console.log(`       ${AYU.dim}${v.hint}${R}`);
        continue;
      }

      if (v.type === ViolationType.FAN_OUT_HIGH && data.coupling) {
        const imports = data.modules.find(m => m.name === v.module)?.declaredImports ?? [];
        console.log(`    ${AYU.orange}⚠${R}  ${AYU.fg}${v.message}${R}`);
        console.log(`       ${AYU.dim}Imported modules: ${imports.join(', ')}${R}`);
        console.log(`       ${AYU.dim}Suggestion: ${v.suggestion}${R}`);
        continue;
      }

      if (v.type === ViolationType.FAN_IN_HIGH && data.coupling) {
        const consumers = data.coupling.fanInMap.get(v.module) ?? [];
        console.log(`    ${AYU.orange}⚠${R}  ${AYU.fg}${v.message}${R}`);
        console.log(`       ${AYU.dim}Consumed by: ${consumers.join(', ')}${R}`);
        console.log(`       ${AYU.dim}Suggestion: ${v.suggestion}${R}`);
        continue;
      }

      const isError = isHardViolation(v);
      const icon = isError ? `${AYU.red}✗${R}` : `${AYU.orange}⚠${R}`;
      
      console.log(`    ${icon}  ${AYU.fg}${v.message}${R}`);
      
      if (v.type === ViolationType.CIRCULAR_DEPENDENCY && v.cycle) {
        console.log(`       ${AYU.dim}${v.cycle.join(' → ')}${R}`);
        console.log(`       ${AYU.dim}${v.suggestion}${R}`);
      } else if (v.location) {
        const fileBase = v.location.file.split(/[/\\]/).pop() || v.location.file;
        console.log(`       ${AYU.dim}${fileBase}:${v.location.line}  →  ${v.suggestion}${R}`);
      } else {
        console.log(`       ${AYU.dim}${v.suggestion}${R}`);
      }
    }
    blank();
  }
}

/**
 * Renders the "Quality Warnings" section.
 * Only shown when qualityWarnings is non-empty.
 * --verbose adds extra detail lines per warning type.
 */
export function printQualityWarningsSection(data: CheckReportData): void {
  const warnings = data.qualityWarnings ?? [];
  if (warnings.length === 0) return;

  sectionHeader('Quality Warnings');

  // Group by module for display
  const moduleNames = Array.from(new Set(warnings.map(w => w.module)));

  for (const moduleName of moduleNames) {
    const moduleWarnings = warnings.filter(w => w.module === moduleName);
    const maxLen = Math.min(30, Math.max(...moduleNames.map(n => n.length), 4));
    const paddedName = moduleName.padEnd(maxLen + 2, ' ');

    for (const rawW of moduleWarnings) {
      const w = rawW as StandardViolation;
      console.log(`  ${AYU.orange}⚠${R}  ${AYU.fg}${paddedName}${R} ${AYU.orange}${w.type}${R}`);
      console.log(`     ${AYU.dim}${w.message}${R}`);

      // Verbose: extra per-type detail
      if (data.options.verbose) {
        if (w.type === ViolationType.FAN_IN_HIGH && data.coupling) {
          const consumers = data.coupling.fanInMap.get(w.module) ?? [];
          if (consumers.length > 0) {
            console.log(`     ${AYU.dim}Consumers: ${consumers.join(', ')}${R}`);
          }
        }
        if (w.type === ViolationType.FAN_OUT_HIGH) {
          const imports = data.modules.find(m => m.name === w.module)?.declaredImports ?? [];
          if (imports.length > 0) {
            console.log(`     ${AYU.dim}Imports: ${imports.join(', ')}${R}`);
          }
        }
        if (w.type === ViolationType.CIRCULAR_DEPENDENCY && w.cycle) {
          console.log(`     ${AYU.dim}${w.cycle.join(' → ')}${R}`);
        }
      }

      if (w.suggestion) {
        console.log(`     ${AYU.dim}↳ ${w.suggestion}${R}`);
      }
    }
  }
  blank();
}

export function printSharedSection(data: CheckReportData): void {
  const sharedViolations = data.violations.filter(
    v => v.type === ViolationType.UNDECLARED_SHARED ||
         v.type === ViolationType.UNUSED_SHARED ||
         v.type === ViolationType.SHARED_SCOPE_VIOLATION
  ) as Array<{ type: ViolationType; module: string; message: string; suggestion: string; location?: { file: string; line: number } }>;

  // Only show if there are violations or --verbose is used
  if (sharedViolations.length === 0 && !data.options.verbose) {
    return;
  }

  sectionHeader('Shared');

  // Group violations by type for display
  const undeclared = sharedViolations.filter(v => v.type === ViolationType.UNDECLARED_SHARED);
  const unused     = sharedViolations.filter(v => v.type === ViolationType.UNUSED_SHARED);
  const scopeVios  = sharedViolations.filter(v => v.type === ViolationType.SHARED_SCOPE_VIOLATION);

  // ── @shared global ──────────────────────────────────────────────────────────
  const globalDeclaredBy = data.sharedInfo?.['@shared'] ?? [];
  const globalHasAnyData = globalDeclaredBy.length > 0 ||
    undeclared.some(v => v.message.includes('@shared')) ||
    unused.some(v => v.message.includes('@shared'));

  if (globalHasAnyData || data.options.verbose) {
    const hasUndeclared = undeclared.some(v => v.message.includes('@shared'));
    const hasUnused     = unused.some(v => v.message.includes('@shared'));

    if (hasUndeclared) {
      const violators = new Set(undeclared.filter(v => v.message.includes('@shared')).map(v => v.module));
      const usageInfo = violators.size > 0 ? ` ${AYU.muted}— modules: ${[...violators].join(', ')}${R}` : '';
      console.log(`  ${AYU.red}✗${R}  @shared          ${AYU.red}UNDECLARED_SHARED${R}${usageInfo}`);
    } else if (hasUnused) {
      const violators = new Set(unused.filter(v => v.message.includes('@shared')).map(v => v.module));
      const usageInfo = violators.size > 0 ? ` ${AYU.muted}— modules: ${[...violators].join(', ')}${R}` : '';
      console.log(`  ${AYU.orange}⚠${R}  @shared          ${AYU.orange}UNUSED_SHARED${R}${usageInfo}`);
    } else {
      // ✔ — show which modules declared @shared in verbose mode
      const usageInfo = globalDeclaredBy.length > 0
        ? ` ${AYU.muted}— used by: ${globalDeclaredBy.join(', ')}${R}`
        : '';
      console.log(`  ${AYU.green}✔${R}  @shared          ${AYU.green}OK${R}${usageInfo}`);
    }
  }

  // ── Domain-scoped shared ─────────────────────────────────────────────────────
  // In verbose mode show ALL registered domain-scoped entries (OK + violations).
  // In non-verbose mode show only those with violations.
  const knownDomainAliases = new Set<string>();

  // Always include aliases that appear in violations
  for (const v of [...undeclared, ...unused, ...scopeVios]) {
    const m = v.message.match(/@([^/'"]+)\/shared/);
    if (m) knownDomainAliases.add(`@${m[1]}/shared`);
  }

  // In verbose mode also include registered aliases from sharedInfo
  if (data.options.verbose && data.sharedInfo) {
    for (const alias of Object.keys(data.sharedInfo)) {
      if (alias !== '@shared') knownDomainAliases.add(alias);
    }
  }

  for (const alias of knownDomainAliases) {
    const domainMatch = alias.match(/@([^/]+)\/shared/);
    const domain = domainMatch?.[1];
    if (!domain) continue;

    const aliasVios  = [...undeclared, ...unused, ...scopeVios].filter(v => v.message.includes(alias));
    const hasScopeVio = aliasVios.some(v => v.type === ViolationType.SHARED_SCOPE_VIOLATION);
    const hasUndecl   = aliasVios.some(v => v.type === ViolationType.UNDECLARED_SHARED);
    const hasUnused    = aliasVios.some(v => v.type === ViolationType.UNUSED_SHARED);
    const aliasLabel   = alias.padEnd(18);

    if (hasScopeVio) {
      const violators = new Set(scopeVios.filter(v => v.message.includes(alias)).map(v => v.module));
      const fromInfo = violators.size > 0 ? ` ${AYU.muted}— from: ${[...violators].join(', ')}${R}` : '';
      console.log(`  ${AYU.red}✗${R}  ${aliasLabel} ${AYU.red}SCOPE_VIOLATION${R}${fromInfo}`);
    } else if (hasUndecl) {
      const violators = new Set(aliasVios.filter(v => v.type === ViolationType.UNDECLARED_SHARED).map(v => v.module));
      console.log(`  ${AYU.red}✗${R}  ${aliasLabel} ${AYU.red}UNDECLARED_SHARED${R} ${AYU.muted}— modules: ${[...violators].join(', ')}${R}`);
    } else if (hasUnused) {
      const violators = new Set(aliasVios.filter(v => v.type === ViolationType.UNUSED_SHARED).map(v => v.module));
      console.log(`  ${AYU.orange}⚠${R}  ${aliasLabel} ${AYU.orange}UNUSED_SHARED${R} ${AYU.muted}— modules: ${[...violators].join(', ')}${R}`);
    } else {
      // ✔ OK — implicit for {domain}
      console.log(`  ${AYU.green}✔${R}  ${aliasLabel} ${AYU.green}OK${R} ${AYU.muted}— implicit for ${domain}${R}`);
    }
  }

  blank();
}

export function printIdentitySection(nitsResult: ReconciliationResult | null, _modules: ModuleGraphNode[]): void {
  if (!nitsResult) return;

  sectionHeader('Identity', 'NITS');
  
  const allRecords = [
    ...nitsResult.confirmed,
    ...nitsResult.moved.map(m => m.record),
    ...nitsResult.candidates.map(m => m.record),
    ...nitsResult.stale
  ];
  
  const byShadowFile = allRecords.filter(r => r.resolvedBy === 'shadow-file').length;
  const byJaccard    = allRecords.filter(r => r.resolvedBy === 'jaccard').length;
  const newModules   = nitsResult.newModules.length;

  if (byShadowFile > 0) {
    console.log(`  ${AYU.green}✔${R}  ${AYU.fg}${byShadowFile.toString().padEnd(3)} modules${R}   ${AYU.green}via shadow-file${R}`);
  }
  if (byJaccard > 0) {
    console.log(`  ${AYU.orange}⚠${R}  ${AYU.fg}${byJaccard.toString().padEnd(3)} modules${R}   ${AYU.orange}via jaccard${R}  ${AYU.dim}— run bootstrap to generate .kerith${R}`);
  }
  if (newModules > 0) {
    console.log(`  ${AYU.cyan}◈${R}  ${AYU.fg}${newModules.toString().padEnd(3)} modules${R}   ${AYU.cyan}new${R} ${AYU.dim}— .kerith generated${R}`);
  }
  
  blank();
}

export function printSummary(data: CheckReportData): void {
  sectionHeader('Summary');

  const modules = data.modules || [];
  const submodules = data.submodules || [];
  const domains = data.domains || [];

  const _totalModules = modules.length + submodules.length + domains.length;
  const allNodes = [...modules, ...submodules, ...domains];
  
  const _getQualifiedName = (m: ModuleGraphNode | DomainNode | SubModuleNode) => m.name; // Simplified for summary matching
  const okNodes = allNodes.filter(n => data.violations.filter(v => v.module === n.name).length === 0).length;

  const domainVios = data.violations.filter(v => v.type === ViolationType.DOMAIN_BOUNDARY_VIOLATION).length;
  const subVios = data.violations.filter(v => submodules.some(s => s.name === v.module) && v.type !== ViolationType.DOMAIN_BOUNDARY_VIOLATION).length;
  const sharedVios = data.violations.filter(v => 
    v.type === ViolationType.UNDECLARED_SHARED ||
    v.type === ViolationType.UNUSED_SHARED ||
    v.type === ViolationType.SHARED_SCOPE_VIOLATION
  ).length;
  const modVios = data.violations.length - domainVios - subVios - sharedVios;
  const newModules = data.nitsResult?.newModules?.length || 0;
  
  const newText = newModules > 0 ? `, ${newModules} new` : '';

  console.log(`  ${AYU.fg}Summary: ${okNodes} OK${newText}, ${domainVios} domain violation${domainVios === 1 ? '' : 's'}, ${modVios} module violation${modVios === 1 ? '' : 's'}, ${subVios} submodule violation${subVios === 1 ? '' : 's'}, ${sharedVios} shared violation${sharedVios === 1 ? '' : 's'}${R}`);

  const couplingWarnings = data.violations.filter(
    v => v.type === ViolationType.FAN_OUT_HIGH || v.type === ViolationType.FAN_IN_HIGH
  ).length;

  if (couplingWarnings > 0) {
    console.log(`  ${AYU.orange}⚠${R}  ${AYU.fg}${couplingWarnings} coupling warning${couplingWarnings === 1 ? '' : 's'}${R}   ${AYU.dim}— run kerith check --help to configure thresholds${R}`);
  }

  if (data.nitsResult) {
    const missingShadow = data.modules.filter(m => {
      const isNew = data.nitsResult?.newModules?.some(n => n.name === m.name);
      return !isNew && m.resolvedBy !== 'shadow-file';
    }).length;
    
    let identityDisplay: string;
    if (missingShadow > 0) {
      identityDisplay = `${AYU.orange}⚠   ${missingShadow} missing .kerith${R}`;
    } else {
      identityDisplay = `${AYU.green}✔   all modules tracked${R}`;
    }
    console.log(`    ${AYU.dim}identity${R}   ${identityDisplay}`);
  } else {
    console.log(`    ${AYU.dim}identity${R}   ${AYU.dim}— disabled${R}`);
  }
  
  blank();
}

export function printNextStep(data: CheckReportData): void {
  const hasJaccard = data.modules.some(m => m.resolvedBy === 'jaccard');
  
  if (!data.options.verbose && hasJaccard) {
    console.log(`  ${AYU.dim}run${R} ${AYU.lime}kerith check --verbose${R} ${AYU.dim}to view IDs and resolution method${R}`);
  }
  
  const hardViolations = data.violations.filter(v => v.severity === 'error');
  const warnViolations = data.violations.filter(v => v.severity === 'warn');
  const willBlock = data.options.strict
    ? (hardViolations.length > 0 || warnViolations.length > 0)
    : hardViolations.length > 0;

  if (willBlock) {
    console.log(`  ${AYU.dim}exit 1 — violations found${R}`);
  } else if (warnViolations.length > 0) {
    console.log(`  ${AYU.dim}exit 0 — ${warnViolations.length} warning${warnViolations.length === 1 ? '' : 's'} (use --strict to block)${R}`);
  } else {
    console.log(`  ${AYU.dim}exit 0 — no violations found${R}`);
  }
  blank();
}
