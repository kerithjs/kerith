import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { scanFromConfig } from '../../src/bootstrap/scanner.js';
import { createRegistry, registryContext } from '../../src/core/registry.js';
import { runEntityRegistration } from '../../src/bootstrap/steps/step-03-register.js';
import { runNitsReconciliation } from '../../src/bootstrap/steps/step-04-nits.js';

// Minimal stub logger
const noopLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function runBootstrapPipeline(projectDir: string) {
  const scan = await scanFromConfig({ origin: 'src' }, projectDir);
  const registry = createRegistry();

  const ctx: any = {
    config: { origin: 'src', nits: { enabled: true } },
    log: noopLog,
    registry,
    scanResult: scan,
    resolvedModules: scan.modules,
    cwd: projectDir,
    allProjectFiles: [],
    absoluteModulesRoot: path.join(projectDir, 'src'),
  };

  await registryContext.run(registry, async () => {
    await runEntityRegistration(ctx);
    await runNitsReconciliation(ctx);
  });

  return { ctx, scan, registry };
}

describe('Integration: step-09 — domain portability', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-step09-test-'));

    // Create package.json to represent the empty destination project
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'dest-project' }));
    
    // Simulate copying a pre-existing domain "orders" into the empty project.
    // The domain brings its own .kerith-register and .kerith shadow files.
    fs.mkdirSync(path.join(tmpDir, 'src/orders/cart'), { recursive: true });
    
    // 1. Domain index
    fs.writeFileSync(
      path.join(tmpDir, 'src/orders/index.ts'),
      `import { Domain } from '@kerith/core'\nDomain('orders')\n`,
      'utf-8'
    );

    // 2. Domain registry (simulating an already assigned domain ID)
    const domainRegisterDir = path.join(tmpDir, 'src/orders/.kerith-register');
    fs.mkdirSync(domainRegisterDir, { recursive: true });
    const domainRegistry = {
      version: '1.0.0',
      domain: {
        id: 'dom_abcdef12',
        name: 'orders',
        registeredAt: new Date().toISOString()
      },
      modules: {},
      submodules: [],
      lastCheck: new Date().toISOString()
    };
    fs.writeFileSync(path.join(domainRegisterDir, 'registry.json'), JSON.stringify(domainRegistry, null, 2), 'utf-8');

    // 3. Module index
    fs.writeFileSync(
      path.join(tmpDir, 'src/orders/cart/index.ts'),
      `import { Module } from '@kerith/core'\nModule('cart')\n`,
      'utf-8'
    );

    // 4. Module shadow file (simulating an already assigned module ID)
    const shadowFile = {
      version: 1,
      id: 'mod_12345678',
      name: 'cart',
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(tmpDir, 'src/orders/cart/.kerith'), JSON.stringify(shadowFile, null, 2), 'utf-8');

    // NOTE: There is NO .kerith global folder yet! This is a fresh destination project.
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves copied domain and module IDs without duplicating them in the global registry', async () => {
    // Run the bootstrap pipeline (this will run NITS reconciliation)
    await runBootstrapPipeline(tmpDir);

    // Assert: global registry is created
    const globalRegistryPath = path.join(tmpDir, '.kerith/registry.json');
    expect(fs.existsSync(globalRegistryPath)).toBe(true);
    const globalRegistry = JSON.parse(fs.readFileSync(globalRegistryPath, 'utf-8'));

    // Assert: NO duplication in the global registry
    expect(Object.keys(globalRegistry.modules).length).toBe(0); // flatModules should be empty

    // Assert: global domains index has the domain with the PRESERVED ID
    expect(globalRegistry.domains['dom_abcdef12']).toBeDefined();
    expect(globalRegistry.domains['dom_abcdef12'].name).toBe('orders');

    // Assert: domain registry preserves the ID and the module ID
    const domainRegistryPath = path.join(tmpDir, 'src/orders/.kerith-register/registry.json');
    const updatedDomainRegistry = JSON.parse(fs.readFileSync(domainRegistryPath, 'utf-8'));
    
    expect(updatedDomainRegistry.domain.id).toBe('dom_abcdef12');
    expect(updatedDomainRegistry.modules['mod_12345678']).toBeDefined();
    expect(updatedDomainRegistry.modules['mod_12345678'].name).toBe('cart');
  });
});
