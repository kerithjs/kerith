import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { detectViolations, ViolationType } from '../../src/cli/lib/violations.js';
import { buildModuleGraph } from '../../src/cli/lib/graph-builder.js';
import type { KerithConfig } from '../../src/config/kerith-config.types.js';

describe('Domain boundary violations (v2 hierarchy)', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');

  const hierarchyAppDir = path.join(fixturesDir, 'v2-hierarchy-app');
  const violationsAppDir = path.join(fixturesDir, 'v2-violations-app');
  
  const hierarchyConfig: KerithConfig = { origin: 'src', strict: false };
  const violationsConfig: KerithConfig = { origin: 'src', strict: false };

  it('detects no violations in a clean hierarchy app', async () => {
    const graph = await buildModuleGraph(hierarchyConfig, hierarchyAppDir);
    const violations = detectViolations(graph, hierarchyAppDir);
    expect(violations).toHaveLength(0);
  });

  it('detects domain-boundary-violation in fixtures', async () => {
    const graph = await buildModuleGraph(violationsConfig, violationsAppDir);
    const violations = detectViolations(graph, violationsAppDir);
    
    const domainViolations = violations.filter(v => v.type === ViolationType.DOMAIN_BOUNDARY_VIOLATION);
    
    // There are 2 domain violations in the fixture:
    // 1. payments -> workspace/members
    // 2. members -> billing/payments
    expect(domainViolations).toHaveLength(2);
    
    const imports = domainViolations.map(v => (v as any).message);
    expect(imports.some(m => m.includes('@workspace/members'))).toBe(true);
    expect(imports.some(m => m.includes('@billing/payments'))).toBe(true);

    for (const v of domainViolations) {
      expect((v as any).suggestion).toContain('instead of');
    }
  });

  it('detects relative-boundary-violation alongside domain violations', async () => {
    const graph = await buildModuleGraph(violationsConfig, violationsAppDir);
    const violations = detectViolations(graph, violationsAppDir);
    
    const relativeViolations = violations.filter(v => v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION);
    
    // There is 1 relative violation in the fixture: payments.service importing from invoices.service
    expect(relativeViolations).toHaveLength(1);
    expect((relativeViolations[0] as any).import).toContain('../../invoices/invoices.service');
  });

  it('detects MODULE_SPACE_CONFLICT when a domain module and flat module share the same name', async () => {
    // Create an in-memory graph to simulate the conflict
    const graph = {
      domains: [
        { name: 'billing', path: '/app/src/billing', modules: [] }
      ],
      modules: [
        { name: 'users', domain: 'billing', dirPath: '/app/src/billing/users', indexPath: '', imports: [], exports: [], shared: [], options: {}, actualImports: [] },
        { name: 'users', domain: undefined, dirPath: '/app/src/users', indexPath: '', imports: [], exports: [], shared: [], options: {}, actualImports: [] }
      ],
      submodules: [],
      shared: []
    };

    const violations = detectViolations(graph as any, '/app');
    
    const conflicts = violations.filter(v => v.type === ViolationType.MODULE_SPACE_CONFLICT);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].module).toBe('users');
    expect((conflicts[0] as any).suggestion).toContain('Cannot exist in both flat space and domain space');
  });
});
