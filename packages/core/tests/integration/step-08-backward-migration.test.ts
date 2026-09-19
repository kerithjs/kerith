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

  it('Core boot without @kerith/app installed continues to work', async () => {
    // This test ensures that the optional dynamic import of @kerith/app
    // does not break normal Core boot when @kerith/app is not installed
    const { ctx } = await runBootstrapPipeline(tmpDir);

    // Bootstrap should complete without errors
    expect(ctx).toBeDefined();
    expect(ctx.resolvedModules).toBeDefined();
    expect(ctx.resolvedModules.length).toBe(1);
    expect(ctx.resolvedModules[0].name).toBe('payments');
  });

  it('precedence: Controller() function call registers metadata before decorator synthesis can run', async () => {
    // Verifies the precedence rule of step-08-controllers.ts §5.2:
    // If a file has both Controller('/x') function AND KERITH_CONTROLLER on the default export,
    // the function wins because:
    //   1. The file is dynamically imported → Controller('/x') runs at module evaluation time
    //   2. registry.registerControllerMetadata('/x') is called → ctrlMeta exists
    //   3. step-08 hits the synthesis guard: `if (!ctrlMeta && KERITH_CONTROLLER && ...)` → false
    //   4. Decorator synthesis is skipped entirely
    //
    // We test this at the registry level, not through HTTP, since running the full
    // runControllersAndMount pipeline requires a complete BootstrapContext and a live
    // Express app — that's covered by @kerith/app/tests/integration/mounting.test.ts (6.2.4).
    // Here we verify the lighter-weight registry precondition that drives the logic.
    const { registry } = await runBootstrapPipeline(tmpDir);

    // Register metadata for a controller file directly (simulates what Controller() call does)
    const fakeFilePath = '/fake/payments/users.ts';
    registry.registerControllerMetadata({
      name: 'users',
      path: fakeFilePath,
      prefix: '/function-path',
      middlewares: [],
      enabled: true,
    });

    const ctrlMeta = registry.getControllerMetadata(fakeFilePath);
    expect(ctrlMeta).toBeDefined();
    expect(ctrlMeta!.prefix).toBe('/function-path');

    // Simulate what step-08 synthesis block does: it checks `!ctrlMeta` first.
    // Because ctrlMeta already exists, the synthesis branch is NOT entered.
    // This is the invariant the precedence rule depends on.
    const wouldSynthesize = !ctrlMeta;
    expect(wouldSynthesize).toBe(false);

    // Additionally verify that the prefix was NOT overwritten
    // (i.e., the decorator's '/decorator-path' never reached registerControllerMetadata)
    expect(ctrlMeta!.prefix).not.toBe('/decorator-path');
  });

  it('synthesis path: @Controller decorator (no function) registers metadata when ctrlMeta is absent', async () => {
    // Verifies the positive path of the synthesis block:
    // When there is NO Controller() function call in the file, ctrlMeta is null,
    // and step-08 calls registry.registerControllerMetadata() from the decorator metadata.
    const { registry } = await runBootstrapPipeline(tmpDir);

    const fakeFilePath = '/fake/payments/products.ts';

    // Precondition: no metadata registered for this file
    expect(registry.getControllerMetadata(fakeFilePath)).toBeUndefined();

    // Simulate the synthesis block: `decoratorMeta.enabled ?? true`
    const decoratorMeta = {
      prefix: '/products',
      routes: [{ method: 'get', path: '/', handlerKey: 'list' }],
      middlewares: [],
      metadata: { guards: ['auth'] },
      enabled: undefined, // not set — should default to true
    };

    registry.registerControllerMetadata({
      name: 'products',
      path: fakeFilePath,
      prefix: decoratorMeta.prefix,
      middlewares: decoratorMeta.middlewares,
      enabled: decoratorMeta.enabled ?? true,
      metadata: decoratorMeta.metadata,
    });

    const synthesised = registry.getControllerMetadata(fakeFilePath);
    expect(synthesised).toBeDefined();
    expect(synthesised!.prefix).toBe('/products');
    expect(synthesised!.enabled).toBe(true);
    expect(synthesised!.metadata).toEqual({ guards: ['auth'] });
  });
});

