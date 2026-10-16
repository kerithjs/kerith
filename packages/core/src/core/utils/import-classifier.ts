import type { InternalRegistry } from '../registry.js';
import type { ModuleGraph } from '../../cli/lib/graph-builder.js';

export interface ClassifierIndex {
  domains: ReadonlySet<string>;
  modules: ReadonlyArray<{ name: string; domain?: string }>;
}

export type ClassifiedImport =
  | { kind: 'domain-module'; domain: string; name: string; deep: boolean }
  | { kind: 'domain-root'; domain: string }
  | { kind: 'modules-alias'; name: string; deep: boolean; candidates: ReadonlyArray<{ name: string; domain?: string }> }
  | { kind: 'shared' }
  | { kind: 'domain-shared'; domain: string }
  | { kind: 'other' };

export function buildClassifierIndexFromRegistry(registry: InternalRegistry): ClassifierIndex {
  const domains = new Set<string>(registry.getAllDomains().map(d => d.name));
  const modules = registry.getAllModules().map(m => ({ name: m.name, domain: m.domain }));
  return { domains, modules };
}

export function buildClassifierIndexFromGraph(graph: ModuleGraph): ClassifierIndex {
  const domains = new Set<string>(graph.domains?.map(d => d.name) || []);
  const modules = graph.modules.map(m => ({ name: m.name, domain: m.domain }));
  return { domains, modules };
}

export function classifyImportTarget(specifier: string, index: ClassifierIndex): ClassifiedImport {
  if (!specifier.startsWith('@')) return { kind: 'other' };

  const parts = specifier.split('/');
  const firstPart = parts[0].slice(1); // strip '@'

  if (firstPart === 'shared') {
    return { kind: 'shared' };
  }

  if (firstPart === 'modules') {
    if (parts.length < 2) return { kind: 'other' };
    const name = parts[1];
    const deep = parts.length > 2;
    const candidates = index.modules.filter(m => m.name === name);
    return { kind: 'modules-alias', name, deep, candidates };
  }

  // At this point, the first part is either a domain or just an unknown alias.
  // The checklist says: @dominio pelado (si dominio in domains) -> domain-root
  if (parts.length === 1) {
    if (index.domains.has(firstPart)) {
      return { kind: 'domain-root', domain: firstPart };
    }
    return { kind: 'other' };
  }

  if (parts.length > 1) {
    const secondPart = parts[1];
    if (secondPart === 'shared') {
      return { kind: 'domain-shared', domain: firstPart };
    }

    // It's a domain module alias
    if (index.domains.has(firstPart)) {
      return {
        kind: 'domain-module',
        domain: firstPart,
        name: secondPart,
        deep: parts.length > 2
      };
    }
  }

  return { kind: 'other' };
}

export function isCrossDomainImport(importerDomain: string | undefined, classified: ClassifiedImport): boolean {
  switch (classified.kind) {
    case 'domain-module':
    case 'domain-root':
      return classified.domain !== importerDomain;
    case 'modules-alias':
      return classified.candidates.length > 0 && !classified.candidates.some(c => c.domain === importerDomain);
    case 'shared':
    case 'domain-shared':
    case 'other':
      return false;
  }
}

export function describeDomainBoundaryViolation(
  moduleName: string,
  importerDomain: string | undefined,
  specifier: string,
  targetDomain: string
): { message: string; details: string } {
  return {
    message: `Domain boundary violation: module "${moduleName}" (domain: ${importerDomain ?? 'none'}) imports from internal domain alias "${specifier}" (domain: ${targetDomain}).`,
    details: `Import from the domain root '@${targetDomain}' instead of the internal alias, or move lo común a '@shared' if it needs to be cross-domain.`
  };
}
