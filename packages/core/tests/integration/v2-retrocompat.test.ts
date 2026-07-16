import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanFromConfig } from '../../src/bootstrap/scanner.js';
import { buildModuleGraph } from '../../src/cli/lib/graph-builder.js';
import { detectViolations } from '../../src/cli/lib/violations.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('V2 Retrocompatibility — v1.x projects', () => {
  it('v1.x project with `modules:` config: no domains, only flat modules', async () => {
    const fixturePath = path.join(fixturesDir, 'v1-compat-app');
    const scan = await scanFromConfig({ modules: 'src/modules/*' }, fixturePath);

    // No domains
    expect(scan.domains.length).toBe(0);
    expect(scan.submodules.length).toBe(0);

    // Flat modules only
    const moduleNames = scan.modules.map(m => m.name);
    expect(moduleNames).toContain('users');
    expect(moduleNames).toContain('auth');
    expect(moduleNames).toContain('orders');
    expect(moduleNames.length).toBe(3);

    // None of the modules have a domain
    for (const mod of scan.modules) {
      expect(mod.domain).toBeUndefined();
    }
  });

  it('v1.x project: check detects zero violations and groups correctly', async () => {
    const fixturePath = path.join(fixturesDir, 'v1-compat-app');
    const graph = await buildModuleGraph({ modules: 'src/modules/*', strict: false }, fixturePath);
    const violations = detectViolations(graph, fixturePath);

    // No violations — clean v1.x app
    expect(violations.length).toBe(0);

    // No domains in graph
    expect(graph.domains.length).toBe(0);

    // Modules are flat (no domain)
    for (const mod of graph.modules) {
      expect((mod as any).domain).toBeUndefined();
    }
  });

  it('v1.x project: scanFromConfig with origin fallback scans without domain sections', async () => {
    // Simulate "no kerith.config.js, falling back to origin: src" behavior
    // The v1-compat-app has modules: src/modules/*, so if we use origin: src it should also work
    // but produce flat modules if there's no Domain() calls.
    const fixturePath = path.join(fixturesDir, 'v1-compat-app');
    const scan = await scanFromConfig({ origin: 'src' }, fixturePath);

    // No domains (none of the index files call Domain())
    expect(scan.domains.length).toBe(0);
    expect(scan.submodules.length).toBe(0);

    // Still finds modules in subdirectories
    const moduleNames = scan.modules.map(m => m.name);
    expect(moduleNames.length).toBeGreaterThan(0);

    // None have domains
    for (const mod of scan.modules) {
      expect(mod.domain).toBeUndefined();
    }
  });

  it('existing scenarios.test.ts behavior preserved — flat modules still work', async () => {
    // Ensure the legacy module glob pattern still works exactly as in v1.x
    const fixturePath = path.join(fixturesDir, 'v1-compat-app');
    const scan = await scanFromConfig({ modules: 'src/modules/*' }, fixturePath);

    expect(scan.domains).toHaveLength(0);
    expect(scan.modules).toHaveLength(3);

    // Every module must have a dirPath and indexPath
    for (const mod of scan.modules) {
      expect(mod.dirPath).toBeTruthy();
      expect(mod.indexPath).toBeTruthy();
    }
  });
});
