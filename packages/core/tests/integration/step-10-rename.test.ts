import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { scanFromConfig } from '../../src/bootstrap/scanner.js';
import { createRegistry, registryContext } from '../../src/core/registry.js';
import { runEntityRegistration } from '../../src/bootstrap/steps/step-03-register.js';
import { runNitsReconciliation } from '../../src/bootstrap/steps/step-04-nits.js';

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

describe('Integration: step-10 — domain rename', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-step10-test-'));

    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
    
    // Simulate a domain that was renamed:
    // Old name: 'old-billing'
    // New name: 'new-billing'
    // New folder: 'src/new-billing'
    fs.mkdirSync(path.join(tmpDir, 'src/new-billing/payments'), { recursive: true });
    
    // Updated Domain index
    fs.writeFileSync(
      path.join(tmpDir, 'src/new-billing/index.ts'),
      `import { Domain } from '@kerith/core'\nDomain('new-billing')\n`,
      'utf-8'
    );

    // Old Domain registry carried over
    const domainRegisterDir = path.join(tmpDir, 'src/new-billing/.kerith-register');
    fs.mkdirSync(domainRegisterDir, { recursive: true });
    const domainRegistry = {
      version: '1.0.0',
      domain: {
        id: 'dom_12345678',
        name: 'old-billing', // <--- Outdated name!
        registeredAt: new Date().toISOString()
      },
      modules: {},
      submodules: [],
      lastCheck: new Date().toISOString()
    };
    fs.writeFileSync(path.join(domainRegisterDir, 'registry.json'), JSON.stringify(domainRegistry, null, 2), 'utf-8');

    // Module index
    fs.writeFileSync(
      path.join(tmpDir, 'src/new-billing/payments/index.ts'),
      `import { Module } from '@kerith/core'\nModule('payments')\n`,
      'utf-8'
    );

    // Module shadow file
    const shadowFile = {
      version: 1,
      id: 'mod_87654321',
      name: 'payments',
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(tmpDir, 'src/new-billing/payments/.kerith'), JSON.stringify(shadowFile, null, 2), 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves the domain ID but updates the domain name when the folder and decorator are renamed', async () => {
    await runBootstrapPipeline(tmpDir);

    // Assert: domain registry preserves ID but updates name
    const domainRegistryPath = path.join(tmpDir, 'src/new-billing/.kerith-register/registry.json');
    const updatedDomainRegistry = JSON.parse(fs.readFileSync(domainRegistryPath, 'utf-8'));
    
    expect(updatedDomainRegistry.domain.id).toBe('dom_12345678'); // Preserved
    expect(updatedDomainRegistry.domain.name).toBe('new-billing'); // Updated!

    // Assert: global registry indexing uses the new name
    const globalRegistryPath = path.join(tmpDir, '.kerith/registry.json');
    const globalRegistry = JSON.parse(fs.readFileSync(globalRegistryPath, 'utf-8'));

    expect(globalRegistry.domains['dom_12345678']).toBeDefined();
    expect(globalRegistry.domains['dom_12345678'].name).toBe('new-billing');
  });
});
