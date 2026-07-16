import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/core/registry.js';

describe('Shared Registry', () => {
  it('registerShared() registra entry correctamente', () => {
    const r = createRegistry();
    r.registerShared({ type: 'global', alias: '@shared', path: '/src/shared' });
    
    const all = r.getAllShared();
    expect(all).toHaveLength(1);
    expect(all[0].alias).toBe('@shared');
  });

  it('registerShared() con alias duplicado -> warn, no lanza, no sobreescribe', () => {
    const r = createRegistry();
    const warnLogs: string[] = [];
    const log = (level: string, message: string) => {
      if (level === 'warn') warnLogs.push(message);
    };

    const entry1 = { type: 'global' as const, alias: '@shared', path: '/src/shared1' };
    const entry2 = { type: 'global' as const, alias: '@shared', path: '/src/shared2' };

    r.registerShared(entry1, log);
    r.registerShared(entry2, log); // Duplicate

    expect(r.getAllShared()).toHaveLength(1);
    expect(r.getShared('@shared')?.path).toBe('/src/shared1'); // Didn't overwrite
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0]).toContain('already registered');
  });

  it("getShared('@shared') retorna el global si existe", () => {
    const r = createRegistry();
    r.registerShared({ type: 'global', alias: '@shared', path: '/src/shared' });
    
    expect(r.getShared('@shared')).toMatchObject({ type: 'global', path: '/src/shared' });
  });

  it("getShared('@billing/shared') retorna el domain-scoped de billing", () => {
    const r = createRegistry();
    r.registerShared({ type: 'domain-scoped', alias: '@billing/shared', path: '/src/billing/_shared', domain: 'billing' });
    
    expect(r.getShared('@billing/shared')).toMatchObject({ alias: '@billing/shared', domain: 'billing' });
  });

  it("getSharedForDomain('billing') retorna la entry correcta", () => {
    const r = createRegistry();
    r.registerShared({ type: 'domain-scoped', alias: '@billing/shared', path: '/src/billing/_shared', domain: 'billing' });
    
    expect(r.getSharedForDomain('billing')).toMatchObject({ alias: '@billing/shared', domain: 'billing' });
  });

  it("isSharedAlias('@shared') -> true", () => {
    const r = createRegistry();
    expect(r.isSharedAlias('@shared')).toBe(true);
    expect(r.isSharedAlias('@shared/utils')).toBe(true);
  });

  it("isSharedAlias('@billing/shared') -> true", () => {
    const r = createRegistry();
    r.registerShared({ type: 'domain-scoped', alias: '@billing/shared', path: '/src/billing/_shared', domain: 'billing' });
    expect(r.isSharedAlias('@billing/shared')).toBe(true);
    expect(r.isSharedAlias('@billing/shared/auth')).toBe(true);
  });

  it("isSharedAlias('@modules/users') -> false", () => {
    const r = createRegistry();
    expect(r.isSharedAlias('@modules/users')).toBe(false);
  });

  it("clearRegistry() limpia el Map de shared", () => {
    const r = createRegistry();
    r.registerShared({ type: 'global', alias: '@shared', path: '/src/shared' });
    expect(r.getAllShared()).toHaveLength(1);

    r.clearRegistry();
    expect(r.getAllShared()).toHaveLength(0);
    expect(r.getShared('@shared')).toBeUndefined();
  });
});
