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

describe('Integration: step-11 — empty domain', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-step11-test-'));

    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
    
    // Create an empty domain folder
    fs.mkdirSync(path.join(tmpDir, 'src/billing'), { recursive: true });
    
    // Domain index
    fs.writeFileSync(
      path.join(tmpDir, 'src/billing/index.ts'),
      `import { Domain } from '@kerith/core'\nDomain('billing')\n`,
      'utf-8'
    );

    // Domain registry with a module that NO LONGER EXISTS on disk
    const domainRegisterDir = path.join(tmpDir, 'src/billing/.kerith-register');
    fs.mkdirSync(domainRegisterDir, { recursive: true });
    const domainRegistry = {
      version: '1.0.0',
      domain: {
        id: 'dom_12345678',
        name: 'billing',
        registeredAt: new Date().toISOString()
      },
      modules: {
        "mod_11111111": {
          id: "mod_11111111",
          name: "deleted-module",
          path: "src/billing/deleted",
          domain: "billing",
          hash: "somehash",
          status: "active",
          createdAt: "2024-01-01T00:00:00Z",
          lastSeen: "2024-01-01T00:00:00Z",
          identifiers: []
        }
      },
      submodules: [],
      lastCheck: new Date().toISOString()
    };
    fs.writeFileSync(path.join(domainRegisterDir, 'registry.json'), JSON.stringify(domainRegistry, null, 2), 'utf-8');

    // Note: We DO NOT create `src/billing/deleted`. The module is gone.
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('empties the domain registry of deleted modules while preserving the domain ID', async () => {
    await runBootstrapPipeline(tmpDir);

    // Assert: domain registry still exists and is updated
    const domainRegistryPath = path.join(tmpDir, 'src/billing/.kerith-register/registry.json');
    expect(fs.existsSync(domainRegistryPath)).toBe(true);
    const updatedDomainRegistry = JSON.parse(fs.readFileSync(domainRegistryPath, 'utf-8'));
    
    expect(updatedDomainRegistry.domain.id).toBe('dom_12345678'); // Preserved ID
    expect(updatedDomainRegistry.domain.name).toBe('billing'); // Same name
    
    // Assert: the modules object is now empty (NO module is left)
    expect(Object.keys(updatedDomainRegistry.modules).length).toBe(0);
  });
});
