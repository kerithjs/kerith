import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  scanOrigin,
  scanModulesLegacy,
  inferDomain,
  inferParentModule,
  type DomainScanEntry,
  type ModuleScanEntry,
} from '../../src/bootstrap/scanner.js';

describe('scanner', () => {
  let tmpRoot: string;

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  const setupTree = (files: Record<string, string>) => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-scan-'));
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(tmpRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return tmpRoot;
  };

  it('scanOrigin infers domain-scoped modules and ignores index without Kerith identifier', async () => {
    const root = setupTree({
      'billing/index.ts': `
        import { Domain } from '@kerith/core';
        Domain('billing');
      `,
      'billing/payments/index.ts': `
        import { Module } from '@kerith/core';
        Module('payments', { imports: ['users'] });
      `,
      'modules/users/index.ts': `
        import { Module } from '@kerith/core';
        Module('users');
      `,
      'orphan/index.ts': `export const x = 1;`,
    });

    const result = await scanOrigin(root);

    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].name).toBe('billing');

    expect(result.modules).toHaveLength(2);
    const payments = result.modules.find((m) => m.name === 'payments');
    const users = result.modules.find((m) => m.name === 'users');
    expect(payments?.domain).toBe('billing');
    expect(users?.domain).toBeUndefined();
  });

  it('scanOrigin classifies SubModule and skips when parent module is missing', async () => {
    const warnLogs: string[] = [];
    const root = setupTree({
      'billing/index.ts': `import { Domain } from '@kerith/core'; Domain('billing');`,
      'billing/payments/index.ts': `import { Module } from '@kerith/core'; Module('payments');`,
      'billing/payments/trial/index.ts': `import { SubModule } from '@kerith/core'; SubModule('trial');`,
      'lonely/sub/index.ts': `import { SubModule } from '@kerith/core'; SubModule('sub');`,
    });

    const result = await scanOrigin(root, {
      log: (level, message) => {
        if (level === 'warn') warnLogs.push(message);
      },
    });

    expect(result.submodules).toHaveLength(1);
    expect(result.submodules[0]).toMatchObject({
      name: 'trial',
      parentModule: 'payments',
      domain: 'billing',
    });
    expect(warnLogs.some((m) => m.includes('lonely'))).toBe(true);
  });

  it('scanOrigin detects domain-scoped and global shared folders', async () => {
    const root = setupTree({
      'billing/index.ts': `import { Domain } from '@kerith/core'; Domain('billing');`,
      'billing/_shared/permissions/index.ts': `export {};`,
      'shared/utils.ts': `export {};`,
    });

    const result = await scanOrigin(root);

    expect(result.shared).toEqual(
      expect.arrayContaining([
        { type: 'domain-scoped', alias: '@billing/shared', path: path.join(root, 'billing', '_shared') },
        { type: 'global', alias: '@shared', path: path.join(root, 'shared') },
      ]),
    );
  });

  it('scanModulesLegacy keeps v1 glob behavior and lists all module directories', async () => {
    const root = setupTree({
      'modules/users/index.ts': `
        import { Module } from '@kerith/core';
        Module('users', { exports: ['UserService'] });
      `,
      'modules/legacy-only/index.ts': `export const legacy = true;`,
    });

    const result = await scanModulesLegacy('modules/*', root);

    expect(result.domains).toHaveLength(0);
    expect(result.modules).toHaveLength(2);
    expect(result.modules.find((m) => m.name === 'users')?.exports).toEqual(['UserService']);
    expect(result.modules.find((m) => m.name === 'legacy-only')?.name).toBe('legacy-only');
  });

  it('inferDomain and inferParentModule work on normalized paths', () => {
    const domains: DomainScanEntry[] = [
      { name: 'billing', dirPath: '/app/src/billing', indexPath: '/app/src/billing/index.ts', options: {} },
    ];
    const modules: ModuleScanEntry[] = [
      {
        name: 'payments',
        dirPath: '/app/src/billing/payments',
        indexPath: '/app/src/billing/payments/index.ts',
        imports: [],
        exports: [],
        shared: [],
        options: {},
      },
    ];

    expect(inferDomain('/app/src/billing/payments/index.ts', domains)).toBe('billing');
    expect(inferDomain('/app/src/modules/users/index.ts', domains)).toBeUndefined();
    expect(inferParentModule('/app/src/billing/payments/trial/index.ts', modules)).toBe('payments');
    expect(inferParentModule('/app/src/billing/payments/index.ts', modules)).toBeUndefined();
  });
});
