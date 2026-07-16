import { describe, it, expect } from 'vitest';
import { detectCouplingWarnings, ViolationType } from '../../src/cli/lib/violations.js';
import type { ModuleGraph, ModuleNode } from '../../src/cli/lib/graph-builder.js';

function createGraph(modules: Partial<ModuleNode>[]): ModuleGraph {
  return {
    domains: [],
    submodules: [],
    modules: modules.map(m => ({
      name: m.name || 'test',
      dirPath: '/src/test',
      indexPath: '/src/test/index.ts',
      declaredImports: m.declaredImports || [],
      actualImports: [],
      internalIdentifiers: [],
      ...m
    }))
  };
}

describe('detectCouplingWarnings', () => {
  it('no warning when fan-out is exactly at threshold', () => {
    const graph = createGraph([
      { name: 'm1', declaredImports: ['a', 'b', 'c', 'd', 'e'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 5 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(0);
  });

  it('warning with severity "warn" when fan-out is one point above threshold', () => {
    const graph = createGraph([
      { name: 'm1', declaredImports: ['a', 'b', 'c', 'd', 'e', 'f'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 5 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe(ViolationType.FAN_OUT_HIGH);
    expect(warnings[0].severity).toBe('warn');
    expect(warnings[0].module).toBe('m1');
  });

  it('no warning when fan-in is exactly at threshold', () => {
    const graph = createGraph([
      { name: 'target', declaredImports: [] },
      { name: 'm1', declaredImports: ['target'] },
      { name: 'm2', declaredImports: ['target'] },
      { name: 'm3', declaredImports: ['target'] },
      { name: 'm4', declaredImports: ['target'] },
      { name: 'm5', declaredImports: ['target'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 10 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(0);
  });

  it('warning with severity "warn" when fan-in is one point above threshold', () => {
    const graph = createGraph([
      { name: 'target', declaredImports: [] },
      { name: 'm1', declaredImports: ['target'] },
      { name: 'm2', declaredImports: ['target'] },
      { name: 'm3', declaredImports: ['target'] },
      { name: 'm4', declaredImports: ['target'] },
      { name: 'm5', declaredImports: ['target'] },
      { name: 'm6', declaredImports: ['target'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 10 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe(ViolationType.FAN_IN_HIGH);
    expect(warnings[0].severity).toBe('warn');
    expect(warnings[0].module).toBe('target');
  });

  it('no warnings when threshold is Number.MAX_SAFE_INTEGER', () => {
    const graph = createGraph([
      { name: 'target', declaredImports: ['a', 'b', 'c', 'd', 'e', 'f'] },
      { name: 'm1', declaredImports: ['target'] },
      { name: 'm2', declaredImports: ['target'] },
      { name: 'm3', declaredImports: ['target'] },
      { name: 'm4', declaredImports: ['target'] },
      { name: 'm5', declaredImports: ['target'] },
      { name: 'm6', declaredImports: ['target'] }
    ]);
    const config = { 
      coupling: { 
        fanOut: { threshold: Number.MAX_SAFE_INTEGER }, 
        fanIn: { threshold: Number.MAX_SAFE_INTEGER } 
      } 
    };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(0);
  });

  it('fan-out counts declaredImports, not actualImports', () => {
    const graph = createGraph([
      { 
        name: 'm1', 
        declaredImports: ['a', 'b', 'c', 'd', 'e', 'f'],
        actualImports: [] 
      }
    ]);
    const config = { coupling: { fanOut: { threshold: 5 }, fanIn: { threshold: 5 } } };
    const { warnings, fanOutMap } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe(ViolationType.FAN_OUT_HIGH);
    expect(fanOutMap.get('m1')).toBe(6);
  });

  it('_shared module with high fan-in is excluded from warnings', () => {
    const graph = createGraph([
      { name: '_shared', declaredImports: [] },
      { name: 'm1', declaredImports: ['_shared'] },
      { name: 'm2', declaredImports: ['_shared'] },
      { name: 'm3', declaredImports: ['_shared'] },
      { name: 'm4', declaredImports: ['_shared'] },
      { name: 'm5', declaredImports: ['_shared'] },
      { name: 'm6', declaredImports: ['_shared'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 10 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(0);
  });

  it('domain/_shared module with high fan-in is excluded from warnings', () => {
    const graph = createGraph([
      { name: 'auth/_shared', declaredImports: [] },
      { name: 'm1', declaredImports: ['auth/_shared'] },
      { name: 'm2', declaredImports: ['auth/_shared'] },
      { name: 'm3', declaredImports: ['auth/_shared'] },
      { name: 'm4', declaredImports: ['auth/_shared'] },
      { name: 'm5', declaredImports: ['auth/_shared'] },
      { name: 'm6', declaredImports: ['auth/_shared'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 10 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings).toHaveLength(0);
  });

  it('all violations returned are of correct type and have severity "warn"', () => {
    const graph = createGraph([
      { name: 'm1', declaredImports: ['target', 'a', 'b', 'c', 'd', 'e'] },
      { name: 'target', declaredImports: [] },
      { name: 'm2', declaredImports: ['target'] },
      { name: 'm3', declaredImports: ['target'] },
      { name: 'm4', declaredImports: ['target'] },
      { name: 'm5', declaredImports: ['target'] },
      { name: 'm6', declaredImports: ['target'] }
    ]);
    const config = { coupling: { fanOut: { threshold: 5 }, fanIn: { threshold: 5 } } };
    const { warnings } = detectCouplingWarnings(graph, config as any);
    
    expect(warnings.length).toBeGreaterThan(0);
    for (const v of warnings) {
      expect([ViolationType.FAN_OUT_HIGH, ViolationType.FAN_IN_HIGH]).toContain(v.type);
      expect(v.severity).toBe('warn');
    }
  });

  it('config default threshold (5) behaves correctly with mixed graph', () => {
    const graph = createGraph([
      { name: 'm1', declaredImports: ['a', 'b', 'c', 'd', 'e', 'f'] }, // fan-out 6 > 5
      { name: 'm2', declaredImports: ['a', 'b', 'c', 'd', 'e'] },      // fan-out 5 = 5 OK
      { name: '_shared', declaredImports: [] },
      { name: 'target', declaredImports: [] },
      { name: 'c1', declaredImports: ['target'] },
      { name: 'c2', declaredImports: ['target'] },
      { name: 'c3', declaredImports: ['target'] },
      { name: 'c4', declaredImports: ['target'] },
      { name: 'c5', declaredImports: ['target'] },
      { name: 'c6', declaredImports: ['target', '_shared'] }, // target fan-in = 7 > 5, _shared fan-in = 2 > 5 but excluded
    ]);

    const config = { coupling: { fanOut: { threshold: 5 }, fanIn: { threshold: 5 } } };
    const { warnings, fanInMap, fanOutMap } = detectCouplingWarnings(graph, config as any);

    const m1FanOut = warnings.filter(w => w.module === 'm1' && w.type === ViolationType.FAN_OUT_HIGH);
    expect(m1FanOut).toHaveLength(1);
    expect(m1FanOut[0].severity).toBe('warn');

    const m2FanOut = warnings.filter(w => w.module === 'm2' && w.type === ViolationType.FAN_OUT_HIGH);
    expect(m2FanOut).toHaveLength(0);

    const targetFanIn = warnings.filter(w => w.module === 'target' && w.type === ViolationType.FAN_IN_HIGH);
    expect(targetFanIn).toHaveLength(1);

    const sharedFanIn = warnings.filter(w => w.module === '_shared' && w.type === ViolationType.FAN_IN_HIGH);
    expect(sharedFanIn).toHaveLength(0);

    expect(fanOutMap.get('m1')).toBe(6);
    expect(fanOutMap.get('m2')).toBe(5);
    expect(fanInMap.get('target')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(fanInMap.get('_shared')).toEqual(['c6']);
  });

  it('fanInMap and fanOutMap returned correctly reflect the graph', () => {
    const graph = createGraph([
      { name: 'm1', declaredImports: ['target'] },
      { name: 'target', declaredImports: [] }
    ]);
    const config = { coupling: { fanOut: { threshold: 5 }, fanIn: { threshold: 5 } } };
    const { fanInMap, fanOutMap } = detectCouplingWarnings(graph, config as any);
    
    expect(fanInMap.get('target')).toEqual(['m1']);
    expect(fanOutMap.get('m1')).toBe(1);
    expect(fanOutMap.get('target')).toBe(0);
  });
});
