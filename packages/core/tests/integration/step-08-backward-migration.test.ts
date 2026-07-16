import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('Integration: step-08 — backward migration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-step08-test-'));

    // package.json minimal
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
    
    // Create domain directory
    fs.mkdirSync(path.join(tmpDir, 'src/billing/payments'), { recursive: true });
    
    // index for billing
    fs.writeFileSync(
      path.join(tmpDir, 'src/billing/index.ts'),
      `import { Domain } from '@kerith/core'\nDomain('billing')\n`,
      'utf-8'
    );
    // index for payments
    fs.writeFileSync(
      path.join(tmpDir, 'src/billing/payments/index.ts'),
      `import { Module } from '@kerith/core'\nModule('payments')\n`,
      'utf-8'
    );

    // Create a LEGACY global registry where payments has domain: "billing"
    // BUT there is NO .kerith-register in src/billing/
    const kerithDir = path.join(tmpDir, '.kerith');
    fs.mkdirSync(kerithDir, { recursive: true });
    
    const legacyGlobalRegistry = {
      project: "test-project",
      version: "1.0.0",
      lastCheck: new Date().toISOString(),
      modules: {
        "mod_12345678": {
          id: "mod_12345678",
          name: "payments",
          path: "src/billing/payments",
          domain: "billing",
          hash: "somehash",
          status: "active",
          createdAt: "2024-01-01T00:00:00Z",
          lastSeen: "2024-01-01T00:00:00Z",
          identifiers: []
        }
      }
    };
    fs.writeFileSync(path.join(kerithDir, 'registry.json'), JSON.stringify(legacyGlobalRegistry, null, 2), 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('migrates legacy domain modules into a newly created domain registry', async () => {
    // Assert precondition: no domain registry exists
    const domainRegistryPath = path.join(tmpDir, 'src/billing/.kerith-register/registry.json');
    expect(fs.existsSync(domainRegistryPath)).toBe(false);

    // Run the bootstrap pipeline
    await runBootstrapPipeline(tmpDir);

    // Assert: domain registry is created and populated with the legacy module
    expect(fs.existsSync(domainRegistryPath)).toBe(true);
    const domainRegistry = JSON.parse(fs.readFileSync(domainRegistryPath, 'utf-8'));
    
    expect(domainRegistry.domain.name).toBe('billing');
    expect(domainRegistry.modules['mod_12345678']).toBeDefined();
    expect(domainRegistry.modules['mod_12345678'].name).toBe('payments');

    // Assert: global registry no longer contains the domain module
    const globalRegistryPath = path.join(tmpDir, '.kerith/registry.json');
    const globalRegistry = JSON.parse(fs.readFileSync(globalRegistryPath, 'utf-8'));
    
    expect(globalRegistry.modules['mod_12345678']).toBeUndefined();
  });
});
