import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRegistry, registryContext } from '../../src/core/registry.js';
import { KerithError } from '../../src/core/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

describe('SubModule()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-submodule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const setupDomainModuleSubmodule = async (
    testFn: (r: ReturnType<typeof createRegistry>) => Promise<void>,
  ) => {
    const billingDir = path.join(tmpDir, 'billing');
    const paymentsDir = path.join(billingDir, 'payments');
    const trialDir = path.join(paymentsDir, 'trial');
    fs.mkdirSync(trialDir, { recursive: true });

    fs.writeFileSync(
      path.join(billingDir, 'index.ts'),
      `import { Domain } from '${moduleUrl}'; Domain('billing');`,
    );
    fs.writeFileSync(
      path.join(paymentsDir, 'index.ts'),
      `import { Module } from '${moduleUrl}'; Module('payments');`,
    );
    fs.writeFileSync(
      path.join(trialDir, 'index.ts'),
      `import { SubModule } from '${moduleUrl}'; SubModule('trial');`,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = createRegistry();
    await registryContext.run(r, async () => {
      await import(pathToFileURL(path.join(billingDir, 'index.ts')).href + `?t=${Date.now()}-d`);
      await import(pathToFileURL(path.join(paymentsDir, 'index.ts')).href + `?t=${Date.now()}-m`);
      await import(pathToFileURL(path.join(trialDir, 'index.ts')).href + `?t=${Date.now()}-s`);
      await testFn(r);
    });
    logSpy.mockRestore();
  };

  it('registers sub-module with qualified name domain/module/sub', async () => {
    await setupDomainModuleSubmodule(async (r) => {
      expect(r.hasSubModule('billing/payments/trial')).toBe(true);
      const sub = r.getAllSubModules()[0];
      expect(sub).toMatchObject({
        name: 'trial',
        parentModule: 'payments',
        domain: 'billing',
      });
    });
  });

  it('throws when nested inside another sub-module', async () => {
    const billingDir = path.join(tmpDir, 'billing');
    const paymentsDir = path.join(billingDir, 'payments');
    const trialDir = path.join(paymentsDir, 'trial');
    const nestedDir = path.join(trialDir, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });

    fs.writeFileSync(
      path.join(billingDir, 'index.ts'),
      `import { Domain } from '${moduleUrl}'; Domain('billing');`,
    );
    fs.writeFileSync(
      path.join(paymentsDir, 'index.ts'),
      `import { Module } from '${moduleUrl}'; Module('payments');`,
    );
    fs.writeFileSync(
      path.join(trialDir, 'index.ts'),
      `import { SubModule } from '${moduleUrl}'; SubModule('trial');`,
    );
    fs.writeFileSync(
      path.join(nestedDir, 'index.ts'),
      `import { SubModule } from '${moduleUrl}'; SubModule('nested');`,
    );

    const r = createRegistry();
    await registryContext.run(r, async () => {
      await import(pathToFileURL(path.join(billingDir, 'index.ts')).href + `?d=1`);
      await import(pathToFileURL(path.join(paymentsDir, 'index.ts')).href + `?m=1`);
      await import(pathToFileURL(path.join(trialDir, 'index.ts')).href + `?s=1`);

      await expect(
        import(pathToFileURL(path.join(nestedDir, 'index.ts')).href + `?n=1`),
      ).rejects.toMatchObject({
        code: 'SUBMODULE_NESTED',
        message: expect.stringContaining('cannot contain nested SubModules'),
      });
    });
  });

  it('throws DUPLICATE_SUBMODULE for the same qualified name', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const dir = path.join(tmpDir, 'payments', 'trial');
      fs.mkdirSync(dir, { recursive: true });
      const indexPath = path.join(dir, 'index.ts');

      r.registerSubModule({
        name: 'trial',
        path: dir,
        parentModule: 'payments',
        domain: 'billing',
      });

      try {
        r.registerSubModule({
          name: 'trial',
          path: dir,
          parentModule: 'payments',
          domain: 'billing',
        });
      } catch (err: unknown) {
        expect((err as KerithError).code).toBe('DUPLICATE_SUBMODULE');
      }
    });
  });
});
