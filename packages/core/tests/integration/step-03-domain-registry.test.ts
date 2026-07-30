import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { scanFromConfig } from '../../src/bootstrap/scanner.js';
import { createRegistry, registryContext } from '../../src/core/registry.js';

import { runEntityRegistration } from '../../src/bootstrap/steps/step-03-register.js';
import { isValidDomainId } from '../../src/nits/domain-id.js';

// Minimal stub logger
const noopLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('Integration: step-03-register — ensureDomainRegistry', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Copy v2-hierarchy-app fixture to a fresh tmpdir so we don't pollute
    // the source fixture with .kerith-register/ files between runs.
    const fixtureDir = path.resolve(__dirname, '../fixtures/v2-hierarchy-app');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-step03-test-'));
    fs.cpSync(fixtureDir, tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .kerith-register/registry.json for a domain created by hand (no CLI)', async () => {
    const billingDir = path.join(tmpDir, 'src/billing');

    // Confirm precondition: no registry exists yet
    const registryPath = path.join(billingDir, '.kerith-register/registry.json');
    expect(fs.existsSync(registryPath)).toBe(false);

    // Run scan + registration (same flow as bootstrap)
    const scan = await scanFromConfig({ origin: 'src' }, tmpDir);
    const registry = createRegistry();

    await registryContext.run(registry, async () => {
      // Build a minimal BootstrapContext enough for runEntityRegistration
      const ctx: any = {
        config: { origin: 'src' },
        log: noopLog,
        registry,
        scanResult: scan,
        resolvedModules: scan.modules,
        cwd: tmpDir,
      };

      await runEntityRegistration(ctx);
    });

    // Assert: registry.json now exists with a valid domain.id
    expect(fs.existsSync(registryPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(data.version).toBe('1.0.0');
    expect(data.domain.name).toBe('billing');
    expect(isValidDomainId(data.domain.id)).toBe(true);
    expect(data.modules).toEqual({});
  });

  it('does not overwrite an existing valid registry.json on repeated bootstrap', async () => {
    const billingDir = path.join(tmpDir, 'src/billing');
    const registryPath = path.join(billingDir, '.kerith-register/registry.json');

    const scan = await scanFromConfig({ origin: 'src' }, tmpDir);
    const registry = createRegistry();

    const runBootstrap = async () => {
      await registryContext.run(registry, async () => {
        const ctx: any = {
          config: { origin: 'src' },
          log: noopLog,
          registry,
          scanResult: scan,
          resolvedModules: scan.modules,
          cwd: tmpDir,
        };
        await runEntityRegistration(ctx);
      });
    };

    // First run — creates registry
    await runBootstrap();
    const firstData = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const firstId = firstData.domain.id;

    // Second run — must not overwrite
    await runBootstrap();
    const secondData = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(secondData.domain.id).toBe(firstId);
  });
});
