import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { scanFromConfig } from '../../src/bootstrap/scanner.js';
import { createRegistry, registryContext } from '../../src/core/registry.js';
import { runEntityRegistration } from '../../src/bootstrap/steps/step-03-register.js';
import { runNitsReconciliation } from '../../src/bootstrap/steps/step-04-nits.js';
import { isValidDomainId } from '../../src/nits/domain-id.js';

// Minimal stub logger (compatible with BootstrapContext.log shape)
const noopLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Runs a full scan + step-03 + step-04 pipeline over a given project dir.
 * Returns the mutable context so callers can inspect outputs.
 */
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

describe('Integration: step-04-nits — domain registry partition', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-step04-test-'));

    // package.json minimal
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));

    // Bootstrap 1 setup: flat module "payments" (no domain)
    fs.mkdirSync(path.join(tmpDir, 'src/payments'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src/payments/index.ts'),
      `import { Module } from '@kerith/core'\nModule('payments')\n`,
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('module moves from global registry to domain registry when wrapped in a Domain()', async () => {
    // ── Bootstrap 1: payments is a flat module ─────────────────────────────
    await runBootstrapPipeline(tmpDir);

    const globalRegistry1 = path.join(tmpDir, '.kerith/registry.json');
    expect(fs.existsSync(globalRegistry1)).toBe(true);

    const global1 = JSON.parse(fs.readFileSync(globalRegistry1, 'utf-8'));
    const paymentsEntry1 = Object.values(global1.modules as Record<string, any>)
      .find((m: any) => m.name === 'payments');
    expect(paymentsEntry1).toBeDefined();

    const paymentsId = paymentsEntry1!.id;
    const paymentsCreatedAt = paymentsEntry1!.createdAt;

    // ── Bootstrap 2: add billing domain, move payments under it ───────────
    fs.mkdirSync(path.join(tmpDir, 'src/billing'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src/billing/index.ts'),
      `import { Domain } from '@kerith/core'\nDomain('billing')\n`,
      'utf-8'
    );

    // Move payments physically into billing/ — this is how the scanner assigns domain
    fs.mkdirSync(path.join(tmpDir, 'src/billing/payments'), { recursive: true });
    fs.renameSync(
      path.join(tmpDir, 'src/payments/index.ts'),
      path.join(tmpDir, 'src/billing/payments/index.ts'),
    );
    fs.rmdirSync(path.join(tmpDir, 'src/payments'));

    await runBootstrapPipeline(tmpDir);

    // ── Assert: payments should NOT appear in global registry ──────────────
    const global2 = JSON.parse(fs.readFileSync(globalRegistry1, 'utf-8'));
    const inGlobal = Object.values(global2.modules as Record<string, any>)
      .find((m: any) => m.name === 'payments');
    expect(inGlobal).toBeUndefined();

    // ── Assert: payments should appear in billing's domain registry ─────────
    const domainRegistryPath = path.join(tmpDir, 'src/billing/.kerith-register/registry.json');
    expect(fs.existsSync(domainRegistryPath)).toBe(true);

    const domainRegistry = JSON.parse(fs.readFileSync(domainRegistryPath, 'utf-8'));
    expect(isValidDomainId(domainRegistry.domain.id)).toBe(true);
    expect(domainRegistry.domain.name).toBe('billing');

    const paymentsInDomain = Object.values(domainRegistry.modules as Record<string, any>)
      .find((m: any) => m.name === 'payments');
    expect(paymentsInDomain).toBeDefined();

    // id must be preserved (same stable NITS id across bootstraps)
    expect(paymentsInDomain!.id).toBe(paymentsId);
    // createdAt must be immutable
    expect(paymentsInDomain!.createdAt).toBe(paymentsCreatedAt);
  });
});
