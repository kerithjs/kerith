import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRegistry, registryContext } from '../../src/core/registry.js';
import { KerithError } from '../../src/core/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

describe('Domain()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-domain-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const runInDomain = async (
    folderName: string,
    code: string,
    testFn: (r: ReturnType<typeof createRegistry>) => Promise<void>,
  ) => {
    const domainDir = path.join(tmpDir, folderName);
    fs.mkdirSync(domainDir, { recursive: true });
    const filePath = path.join(domainDir, 'index.ts');
    const finalCode = code.replace(/\{\{SOURCE\}\}/g, moduleUrl);
    fs.writeFileSync(filePath, finalCode);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = createRegistry();
    await registryContext.run(r, async () => {
      await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
      await testFn(r);
    });
    logSpy.mockRestore();
  };

  it('registers the domain when called from index.ts with matching name', async () => {
    await runInDomain('billing', `
      import { Domain } from '{{SOURCE}}';
      Domain('billing', { description: 'Billing domain' });
    `, async (r) => {
      expect(r.hasDomain('billing')).toBe(true);
      expect(r.getDomain('billing')?.description).toBe('Billing domain');
    });
  });

  it('throws REGISTRY_MISSING_CONTEXT outside createApp scope', async () => {
    const domainDir = path.join(tmpDir, 'billing');
    fs.mkdirSync(domainDir, { recursive: true });
    const filePath = path.join(domainDir, 'index.ts');
    fs.writeFileSync(
      filePath,
      `import { Domain } from '${moduleUrl}'; Domain('billing');`,
    );

    await expect(
      import(pathToFileURL(filePath).href + `?t=${Date.now()}`),
    ).rejects.toMatchObject({ code: 'REGISTRY_MISSING_CONTEXT' });
  });

  it('throws DUPLICATE_DOMAIN for the same name', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const dir = path.join(tmpDir, 'billing');
      r.registerDomain({
        name: 'billing',
        path: dir,
        registeredAt: new Date().toISOString(),
      });

      expect(() => {
        r.registerDomain({
          name: 'billing',
          path: path.join(tmpDir, 'other'),
          registeredAt: new Date().toISOString(),
        });
      }).toThrowError(KerithError);

      try {
        r.registerDomain({
          name: 'billing',
          path: path.join(tmpDir, 'other'),
          registeredAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        expect((err as KerithError).code).toBe('DUPLICATE_DOMAIN');
      }
    });
  });

  it('throws INVALID_DOMAIN_DECLARATION when name does not match folder', async () => {
    const domainDir = path.join(tmpDir, 'wrong-folder');
    fs.mkdirSync(domainDir, { recursive: true });
    const filePath = path.join(domainDir, 'index.ts');
    fs.writeFileSync(
      filePath,
      `import { Domain } from '${moduleUrl}'; Domain('billing');`,
    );

    const r = createRegistry();
    await registryContext.run(r, async () => {
      await expect(import(pathToFileURL(filePath).href + `?t=${Date.now()}`)).rejects.toMatchObject({
        code: 'INVALID_DOMAIN_DECLARATION',
      });
    });
  });
});
