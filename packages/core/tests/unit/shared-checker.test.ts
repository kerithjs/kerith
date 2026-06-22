import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkSharedAccess } from '../../src/cli/lib/shared-checker.js';
import { createRegistry } from '../../src/core/registry.js';
import { ViolationType, isErrorViolation } from '../../src/cli/lib/violations.js';
import * as importScanner from '../../src/cli/lib/import-scanner.js';
import fg from 'fast-glob';
import fs from 'node:fs';

describe('Shared Checker', () => {
  const cwd = '/project';

  function setupRegistry() {
    const r = createRegistry();
    r.registerShared({ type: 'global', alias: '@shared', path: '/project/src/shared' });
    r.registerShared({ type: 'domain-scoped', alias: '@billing/shared', path: '/project/src/billing/_shared', domain: 'billing' });
    return r;
  }

  beforeEach(() => {
    vi.spyOn(fg, 'sync').mockImplementation((pattern, opts: any) => {
      const dir = opts.cwd || '';
      if (dir.includes('profile')) return ['/project/dummy-sub.ts'];
      return ['/project/dummy.ts'];
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Paso A — UNDECLARED_SHARED', () => {
    it('Módulo importa @shared/utils sin shared: ["@shared"] -> violación reportada', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: [] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      
      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: [], imports: [], files: [] }],
        submodules: [],
        domains: []
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([{ specifier: '@shared/utils', line: 1 }] as any);

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe(ViolationType.UNDECLARED_SHARED);
      expect(violations[0].module).toBe('users');
    });

    it('Módulo importa @shared/utils con shared: ["@shared"] -> sin violación', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: ['@shared'] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      
      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: ['@shared'], imports: [], files: [] }],
        submodules: [],
        domains: []
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([{ specifier: '@shared/utils', line: 1 }] as any);

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(0);
    });

    it('SubModule importa @shared/utils y módulo padre tiene shared: ["@shared"] -> sin violación', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: ['@shared'] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      r.registerSubModule({ name: 'profile', parentModule: 'users', path: '/project/src/modules/users/profile' });

      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: ['@shared'], imports: [], files: [] }],
        submodules: [{ name: 'profile', dirPath: '/project/src/modules/users/profile', parentModule: 'users', files: [] }],
        domains: []
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockImplementation((file: string) => {
        if (file.includes('dummy-sub')) return [{ specifier: '@shared/utils', line: 1 }] as any;
        return [];
      });

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(0);
    });

    it('SubModule importa @shared/utils y módulo padre NO tiene @shared -> violación en el padre', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: [] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      r.registerSubModule({ name: 'profile', parentModule: 'users', path: '/project/src/modules/users/profile' });

      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: [], imports: [], files: [] }],
        submodules: [{ name: 'profile', dirPath: '/project/src/modules/users/profile', parentModule: 'users', files: [] }],
        domains: []
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockImplementation((file: string) => {
        if (file.includes('dummy-sub')) return [{ specifier: '@shared/utils', line: 1 }] as any;
        return [];
      });

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe(ViolationType.UNDECLARED_SHARED);
      expect(violations[0].module).toBe('users'); // Reported on parent
    });
  });

  describe('Paso B — UNUSED_SHARED', () => {
    it('Módulo declara shared: ["@shared"] pero ningún archivo importa de @shared -> violación', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: ['@shared'] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      
      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: ['@shared'], imports: [], files: [] }],
        submodules: [],
        domains: []
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([]);

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe(ViolationType.UNUSED_SHARED);
      expect(violations[0].module).toBe('users');
    });

    it('Módulo declara shared: ["@shared"] y al menos un archivo importa -> sin violación', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: ['@shared'] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');

      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: ['@shared'], imports: [], files: [] }],
        submodules: [],
        domains: []
      };

      // At least one file imports from @shared
      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([{ specifier: '@shared/utils', line: 1 }] as any);

      const violations = await checkSharedAccess(graph, r, cwd);
      const unused = violations.filter(v => v.type === ViolationType.UNUSED_SHARED);
      expect(unused).toHaveLength(0);
    });

    it('Módulo declara shared: ["@shared"] y SubModule importa -> sin violación (padre usa shared via hijo)', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: ['@shared'] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      r.registerSubModule({ name: 'profile', parentModule: 'users', path: '/project/src/modules/users/profile' });

      const graph: any = {
        modules: [{ name: 'users', dirPath: '/project/src/modules/users', declaredImports: ['@shared'], imports: [], files: [] }],
        submodules: [{ name: 'profile', dirPath: '/project/src/modules/users/profile', parentModule: 'users', files: [] }],
        domains: []
      };

      // Only the submodule imports @shared, not the parent module itself
      vi.spyOn(importScanner, 'extractModuleImports').mockImplementation((file: string) => {
        if (file.includes('dummy-sub')) return [{ specifier: '@shared/utils', line: 1 }] as any;
        return [];
      });

      const violations = await checkSharedAccess(graph, r, cwd);
      const unused = violations.filter(v => v.type === ViolationType.UNUSED_SHARED && v.module === 'users');
      // SubModule usage counts as parent usage — no UNUSED_SHARED on the parent
      expect(unused).toHaveLength(0);
    });
  });

  describe('Paso C — SHARED_SCOPE_VIOLATION', () => {
    it('Módulo de workspace importa @billing/shared -> violación, siempre error', async () => {
      const r = setupRegistry();
      r.registerModule('orders', { imports: [], shared: [] }, '/project/src/workspace/orders', '/project/src/workspace/orders/index.ts', 'id_1', 'workspace');
      
      const graph: any = {
        modules: [{ name: 'orders', domain: 'workspace', dirPath: '/project/src/workspace/orders', declaredImports: [], imports: [], files: [] }],
        submodules: [],
        domains: [{ name: 'billing' }] // Register billing domain
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([{ specifier: '@billing/shared', line: 1 }] as any);

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe(ViolationType.SHARED_SCOPE_VIOLATION);
      expect(violations[0].module).toBe('orders');
    });

    it('Módulo de billing importa @billing/shared -> sin violación', async () => {
      const r = setupRegistry();
      r.registerModule('payments', { imports: [], shared: [] }, '/project/src/billing/payments', '/project/src/billing/payments/index.ts', 'id_1', 'billing');
      
      const graph: any = {
        modules: [{ name: 'payments', domain: 'billing', dirPath: '/project/src/billing/payments', declaredImports: [], imports: [], files: [] }],
        submodules: [],
        domains: [{ name: 'billing' }]
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([{ specifier: '@billing/shared', line: 1 }] as any);

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(0);
    });

    it('Módulo plano (src/modules/) importa @billing/shared -> violación', async () => {
      const r = setupRegistry();
      r.registerModule('users', { imports: [], shared: [] }, '/project/src/modules/users', '/project/src/modules/users/index.ts', 'id_1');
      
      const graph: any = {
        modules: [{ name: 'users', domain: undefined, dirPath: '/project/src/modules/users', declaredImports: [], imports: [], files: [] }],
        submodules: [],
        domains: [{ name: 'billing' }]
      };

      vi.spyOn(importScanner, 'extractModuleImports').mockReturnValue([{ specifier: '@billing/shared', line: 1 }] as any);

      const violations = await checkSharedAccess(graph, r, cwd);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe(ViolationType.SHARED_SCOPE_VIOLATION);
    });

    it('Módulo plano importa @shared -> sin violación (si lo declaró)', async () => {
       // Done in UNDECLARED_SHARED test 2
    });
  });

  describe('Severidad', () => {
    it('isErrorViolation determina si causa exit 1', () => {
      expect(isErrorViolation({ type: ViolationType.SHARED_SCOPE_VIOLATION, severity: 'error' } as any)).toBe(true);
      expect(isErrorViolation({ type: ViolationType.UNDECLARED_SHARED, severity: 'warn' } as any)).toBe(false);
      expect(isErrorViolation({ type: ViolationType.UNUSED_SHARED, severity: 'warn' } as any)).toBe(false);
    });
  });
});
