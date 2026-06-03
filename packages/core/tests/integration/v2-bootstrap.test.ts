import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanFromConfig } from '../../src/bootstrap/scanner.js';
import { createRegistry, registryContext } from '../../src/core/registry.js';
import { registerEntitiesFromScan } from '../../src/bootstrap/register-from-scan.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('V2 Hierarchy Bootstrap (scanner → registry)', () => {
  it('scanFromConfig on v2-hierarchy-app returns domains, modules, and submodules', async () => {
    const fixturePath = path.join(fixturesDir, 'v2-hierarchy-app');
    const scan = await scanFromConfig({ origin: 'src' }, fixturePath);

    // Domains
    const domainNames = scan.domains.map(d => d.name);
    expect(domainNames).toContain('billing');
    expect(domainNames).toContain('workspace');

    // Modules
    const moduleNames = scan.modules.map(m => m.name);
    expect(moduleNames).toContain('payments');
    expect(moduleNames).toContain('invoices');
    expect(moduleNames).toContain('members');
    expect(moduleNames).toContain('users');   // flat module

    // SubModules
    const subNames = scan.submodules.map(s => s.name);
    expect(subNames).toContain('trial');
  });

  it('registerEntitiesFromScan populates registry with domains and submodules', async () => {
    const fixturePath = path.join(fixturesDir, 'v2-hierarchy-app');
    const scan = await scanFromConfig({ origin: 'src' }, fixturePath);

    const registry = createRegistry();
    await registryContext.run(registry, async () => {
      registerEntitiesFromScan(registry, scan);

      // Domains
      const domains = registry.getAllDomains();
      const domainNames = domains.map(d => d.name);
      expect(domainNames).toContain('billing');
      expect(domainNames).toContain('workspace');
      expect(domains.length).toBe(2);

      // Submodules
      const subs = registry.getAllSubModules();
      expect(subs.map(s => s.name)).toContain('trial');
      expect(subs.length).toBe(1);

      // Modules need to be registered via Module() identifier —
      // registerEntitiesFromScan only seeds domains, shared, and submodules.
      // Domain-module association is done after Module() calls populate the registry.
    });
  });

  it('modules have correct domain association from scan', async () => {
    const fixturePath = path.join(fixturesDir, 'v2-hierarchy-app');
    const scan = await scanFromConfig({ origin: 'src' }, fixturePath);

    const registry = createRegistry();
    await registryContext.run(registry, async () => {
      registerEntitiesFromScan(registry, scan);

      // Register modules manually from scan data (simulating what Module() + importIndex does)
      for (const mod of scan.modules) {
        registry.registerModule(
          mod.name,
          { imports: mod.imports, exports: mod.exports },
          mod.dirPath,
          mod.indexPath,
          `id_${mod.name}`,
          mod.domain,
        );
      }

      // getDomainModules
      const billingModules = registry.getDomainModules('billing').map(m => m.name);
      expect(billingModules).toContain('payments');
      expect(billingModules).toContain('invoices');
      expect(billingModules.length).toBe(2);

      const workspaceModules = registry.getDomainModules('workspace').map(m => m.name);
      expect(workspaceModules).toContain('members');
      expect(workspaceModules.length).toBe(1);

      // getModuleSubModules
      const trialSubs = registry.getModuleSubModules('payments', 'billing').map(s => s.name);
      expect(trialSubs).toContain('trial');

      // Flat module: users (no domain)
      const usersMod = registry.getModule('users');
      expect(usersMod).toBeDefined();
      expect((usersMod as any).domain).toBeUndefined();
    });
  });
});
