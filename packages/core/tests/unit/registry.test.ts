import { describe, it, expect } from 'vitest';
import { createRegistry, registryContext, getActiveRegistry, getRegistry } from '../../src/core/registry.js';
import { KerithError } from '../../src/core/errors.js';

describe('Registry', () => {
  it('registers and retrieves a module', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule(
        'users',
        { imports: [], exports: ['UserService'] },
        '/src/modules/users',
        '/src/modules/users/index.ts',
        'mod_users_001'
      );

      expect(getActiveRegistry().hasModule('users')).toBe(true);
      expect(getActiveRegistry().hasModuleById('mod_users_001')).toBe(true);
      expect(getActiveRegistry().hasModuleById('unknown')).toBe(false);

      const registered = getActiveRegistry().getModule('users');
      expect(registered).toEqual({
        id: 'mod_users_001',
        name: 'users',
        path: '/src/modules/users',
        imports: [],
        exports: ['UserService'],
        controllers: []
      });

      const byId = getActiveRegistry().getModuleById('mod_users_001');
      expect(byId).toEqual(registered);

      const byPath = getActiveRegistry().getModuleByPath('/src/modules/users');
      expect(byPath).toEqual(registered);
      
      // Normalized path check
      expect(getActiveRegistry().getModuleByPath('\\src\\modules\\users')).toEqual(registered);

      const all = getActiveRegistry().getAllModules();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('users');
      expect(all[0].id).toBe('mod_users_001');
    });
  });

  it('throws DUPLICATE_MODULE when registering twice with same nitsId or same path', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const name = 'auth';
      const options = { imports: [], exports: [] };
      const dirPath = '/src/modules/auth';
      const indexPath = '/src/modules/auth/index.ts';
      const id = 'mod_auth_123';

      getActiveRegistry().registerModule(name, options, dirPath, indexPath, id);

      // 1. Same ID, different name/path -> Error
      expect(() => {
        getActiveRegistry().registerModule('other', options, '/src/modules/other', '/src/modules/other/index.ts', id);
      }).toThrowError(KerithError);

      // 2. Same Path, different ID/name -> Error
      expect(() => {
        getActiveRegistry().registerModule('auth2', options, dirPath, '/src/modules/auth/index.ts', 'other_id');
      }).toThrowError(KerithError);
      
      try {
        getActiveRegistry().registerModule('auth2', options, dirPath, '/src/modules/auth/index.ts', 'other_id');
      } catch (e: any) {
        expect(e.code).toBe('DUPLICATE_MODULE');
      }
    });
  });

  it('allows billing/payments and workspace/payments to coexist with domain-scoped keys', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule(
        'payments',
        { imports: [] },
        '/src/billing/payments',
        '/src/billing/payments/index.ts',
        'mod_billing_payments',
        'billing',
      );
      getActiveRegistry().registerModule(
        'payments',
        { imports: [] },
        '/src/workspace/payments',
        '/src/workspace/payments/index.ts',
        'mod_workspace_payments',
        'workspace',
      );

      expect(getActiveRegistry().hasModule('payments', 'billing')).toBe(true);
      expect(getActiveRegistry().hasModule('payments', 'workspace')).toBe(true);
      expect(getActiveRegistry().hasModule('payments')).toBe(false);

      expect(getActiveRegistry().getModule('payments', 'billing')?.id).toBe(
        'mod_billing_payments',
      );
      expect(getActiveRegistry().getModule('payments', 'workspace')?.id).toBe(
        'mod_workspace_payments',
      );
    });
  });

  it('getDomainModules and getModuleSubModules filter by hierarchy', async () => {
    const r = createRegistry();
    const now = new Date().toISOString();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerDomain({
        name: 'billing',
        path: '/src/billing',
        registeredAt: now,
      });
      getActiveRegistry().registerModule(
        'payments',
        {},
        '/src/billing/payments',
        '/src/billing/payments/index.ts',
        'id_pay',
        'billing',
      );
      getActiveRegistry().registerSubModule({
        name: 'trial',
        path: '/src/billing/payments/trial',
        parentModule: 'payments',
        domain: 'billing',
      });

      expect(getActiveRegistry().getDomainModules('billing')).toHaveLength(1);
      expect(getActiveRegistry().getModuleSubModules('payments', 'billing')).toHaveLength(1);
      expect(getActiveRegistry().resolveHierarchyLevel('billing', '/src/billing')).toBe('domain');
      expect(getActiveRegistry().resolveHierarchyLevel('trial', '/src/billing/payments/trial')).toBe(
        'submodule',
      );
      expect(getActiveRegistry().resolveHierarchyLevel('payments', '/src/billing/payments')).toBe(
        'module',
      );
    });
  });

  it('clearRegistry() removes domains and submodules for test isolation', () => {
    const r = createRegistry();
    const now = new Date().toISOString();
    r.registerDomain({ name: 'billing', path: '/billing', registeredAt: now });
    r.registerSubModule({
      name: 'trial',
      path: '/billing/payments/trial',
      parentModule: 'payments',
      domain: 'billing',
    });
    r.clearRegistry();
    expect(r.getAllDomains()).toHaveLength(0);
    expect(r.getAllSubModules()).toHaveLength(0);
  });

  it('registers and resolves aliases', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerAlias('@config', '/src/config');
      getActiveRegistry().registerAlias('@shared', '/src/shared');

      expect(getActiveRegistry().resolveAlias('@config')).toBe('/src/config');
      expect(getActiveRegistry().resolveAlias('@shared')).toBe('/src/shared');
      expect(getActiveRegistry().resolveAlias('@unknown')).toBeUndefined();

      const all = getActiveRegistry().getAllAliases();
      expect(all).toEqual({
        '@config': '/src/config',
        '@shared': '/src/shared'
      });
    });
  });

  it('allows overwriting an existing alias with a different target', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerAlias('@utils', '/src/utils');
      // Overwrite
      getActiveRegistry().registerAlias('@utils', '/src/other-utils');

      expect(getActiveRegistry().resolveAlias('@utils')).toBe('/src/other-utils');
    });
  });

  it('getDependencyGraph() reflects declared imports', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('users', { imports: ['database'] }, '/users', '/users/index.ts', 'id_u');
      getActiveRegistry().registerModule('database', { imports: [] }, '/database', '/database/index.ts', 'id_d');

      const graph = getActiveRegistry().getDependencyGraph();
      expect(graph.get('users')).toEqual(['database']);
      expect(graph.get('database')).toEqual([]);
    });
  });

  it('findCircularDependencies() detects A -> B -> A', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('A', { imports: ['B'] }, '/a', '/a/index.ts', 'id_a');
      getActiveRegistry().registerModule('B', { imports: ['A'] }, '/b', '/b/index.ts', 'id_b');

      const cycles = getActiveRegistry().findCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toEqual(['A', 'B', 'A']);
    });
  });

  it('seeds and retrieves NITS IDs by path', () => {
    const r = createRegistry();
    r.seedNitsIds(new Map([['/abs/path', 'mod_123']]));
    
    expect(r.getNitsIdForPath('/abs/path')).toBe('mod_123');
    // Normalized
    expect(r.getNitsIdForPath('\\abs\\path')).toBe('mod_123');
    expect(r.getNitsIdForPath('/unknown')).toBeUndefined();
  });

  it('getRegistry() exposes KerithRegistryAdvanced interface', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const advancedRegistry = getRegistry();
      expect(advancedRegistry).toBeDefined();
      expect(typeof advancedRegistry.hasModule).toBe('function');
      expect(typeof advancedRegistry.getDependencyGraph).toBe('function');
    });
  });

  it('getActiveRegistry() throws REGISTRY_MISSING_CONTEXT outside createApp', () => {
    expect(() => getActiveRegistry()).toThrow(KerithError);
    try {
      getActiveRegistry();
    } catch (e: any) {
      expect(e.code).toBe('REGISTRY_MISSING_CONTEXT');
    }
  });

  it('registers shared entries and resolves aliases by domain', () => {
    const r = createRegistry();

    r.registerShared({
      type: 'global',
      alias: '@shared',
      path: '/src/shared',
    });
    r.registerShared({
      type: 'domain-scoped',
      alias: '@billing/shared',
      path: '/src/billing/_shared',
      domain: 'billing',
    });

    expect(r.getShared('@shared')).toMatchObject({ type: 'global', path: '/src/shared' });
    expect(r.getSharedForDomain('billing')).toMatchObject({
      alias: '@billing/shared',
      domain: 'billing',
    });
    expect(r.getAllShared()).toHaveLength(2);
    expect(r.isSharedAlias('@shared')).toBe(true);
    expect(r.isSharedAlias('@shared/utils')).toBe(true);
    expect(r.isSharedAlias('@billing/shared')).toBe(true);
    expect(r.isSharedAlias('@billing/shared/permissions')).toBe(true);
    expect(r.isSharedAlias('@billing/payments')).toBe(false);
  });

  it('registerShared is idempotent and warns on duplicate alias', () => {
    const r = createRegistry();
    const warnLogs: string[] = [];
    const log = (level: string, message: string) => {
      if (level === 'warn') warnLogs.push(message);
    };

    const entry = {
      type: 'global' as const,
      alias: '@shared',
      path: '/src/shared',
    };

    r.registerShared(entry, log);
    r.registerShared(entry, log);

    expect(r.getAllShared()).toHaveLength(1);
    expect(warnLogs.some((m) => m.includes('@shared'))).toBe(true);
  });

  it('clearRegistry() clears shared entries for test isolation', () => {
    const r = createRegistry();
    r.registerShared({ type: 'global', alias: '@shared', path: '/src/shared' });
    expect(r.getAllShared()).toHaveLength(1);

    r.clearRegistry();
    expect(r.getAllShared()).toHaveLength(0);
    expect(r.getShared('@shared')).toBeUndefined();
  });

  it('two concurrent registryContext.run() calls have isolated registries', async () => {
    const rA = createRegistry();
    const rB = createRegistry();

    await Promise.all([
      registryContext.run(rA, async () => {
        getActiveRegistry().registerModule('moduleA', {}, '/pathA', '/pathA/index.ts', 'id_a_unique');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getActiveRegistry().hasModule('moduleA')).toBe(true);
        expect(getActiveRegistry().hasModule('moduleB')).toBe(false);
      }),
      registryContext.run(rB, async () => {
        getActiveRegistry().registerModule('moduleB', {}, '/pathB', '/pathB/index.ts', 'id_b_unique');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getActiveRegistry().hasModule('moduleB')).toBe(true);
        expect(getActiveRegistry().hasModule('moduleA')).toBe(false);
      })
    ]);
  });
});
