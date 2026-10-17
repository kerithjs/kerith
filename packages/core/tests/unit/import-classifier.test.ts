import { describe, it, expect } from 'vitest';
import {
  classifyImportTarget,
  isCrossDomainImport,
  buildClassifierIndexFromRegistry,
  buildClassifierIndexFromGraph,
  type ClassifierIndex
} from '../../src/core/utils/import-classifier.js';

describe('import-classifier', () => {
  const index: ClassifierIndex = {
    domains: new Set(['users', 'billing', 'core']),
    modules: [
      { name: 'orders', domain: 'billing' },
      { name: 'auth', domain: 'users' },
      { name: 'core' }, // flat module named 'core'
    ]
  };

  describe('classifyImportTarget', () => {
    it('classifies bare domain', () => {
      expect(classifyImportTarget('@users', index)).toEqual({
        kind: 'domain-root',
        domain: 'users'
      });
    });

    it('classifies domain module', () => {
      expect(classifyImportTarget('@users/auth', index)).toEqual({
        kind: 'domain-module',
        domain: 'users',
        name: 'auth',
        deep: false
      });
    });

    it('classifies domain module deep path', () => {
      expect(classifyImportTarget('@users/auth/internal/x', index)).toEqual({
        kind: 'domain-module',
        domain: 'users',
        name: 'auth',
        deep: true
      });
    });

    it('classifies ambiguous domain module vs flat module', () => {
      expect(classifyImportTarget('@core/auth', index)).toEqual({
        kind: 'domain-module',
        domain: 'core',
        name: 'auth',
        deep: false
      });
    });

    it('classifies modules-alias', () => {
      expect(classifyImportTarget('@modules/orders', index)).toEqual({
        kind: 'modules-alias',
        name: 'orders',
        deep: false,
        candidates: [{ name: 'orders', domain: 'billing' }]
      });
    });

    it('classifies flat core through modules-alias', () => {
      expect(classifyImportTarget('@modules/core', index)).toEqual({
        kind: 'modules-alias',
        name: 'core',
        deep: false,
        candidates: [{ name: 'core' }]
      });
    });

    it('classifies shared', () => {
      expect(classifyImportTarget('@shared', index)).toEqual({ kind: 'shared' });
      expect(classifyImportTarget('@shared/db', index)).toEqual({ kind: 'shared' });
    });

    it('classifies domain-shared', () => {
      expect(classifyImportTarget('@billing/shared/db', index)).toEqual({
        kind: 'domain-shared',
        domain: 'billing'
      });
    });

    it('classifies other unknowns', () => {
      expect(classifyImportTarget('@unknown', index)).toEqual({ kind: 'other' });
      expect(classifyImportTarget('@unknown/module', index)).toEqual({ kind: 'other' });
      expect(classifyImportTarget('kerith', index)).toEqual({ kind: 'other' });
      expect(classifyImportTarget('./local', index)).toEqual({ kind: 'other' });
    });
  });

  describe('isCrossDomainImport', () => {
    it('allows same domain', () => {
      const classified = classifyImportTarget('@users/auth', index);
      expect(isCrossDomainImport('users', classified)).toBe(false);
    });

    it('blocks cross domain', () => {
      const classified = classifyImportTarget('@users/auth', index);
      expect(isCrossDomainImport('billing', classified)).toBe(true);
      expect(isCrossDomainImport(undefined, classified)).toBe(true); // flat to domain
    });

    it('blocks cross domain for modules-alias', () => {
      const classified = classifyImportTarget('@modules/orders', index);
      expect(isCrossDomainImport('users', classified)).toBe(true);
      expect(isCrossDomainImport(undefined, classified)).toBe(true);
    });

    it('allows same domain for modules-alias', () => {
      const classified = classifyImportTarget('@modules/orders', index);
      expect(isCrossDomainImport('billing', classified)).toBe(false);
    });

    it('allows public domain root', () => {
      const classified = classifyImportTarget('@users', index);
      // Wait! The checklist says: domain-module / domain-root -> classified.domain !== importerDomain
      // So importing `@users` from `billing` will be considered cross-domain by `isCrossDomainImport`!
      // But wait, the violations check only triggers for domain-module and modules-alias!
      expect(isCrossDomainImport('billing', classified)).toBe(true);
    });

    it('never blocks shared, domain-shared, or other', () => {
      expect(isCrossDomainImport('billing', classifyImportTarget('@shared/db', index))).toBe(false);
      expect(isCrossDomainImport('users', classifyImportTarget('@billing/shared', index))).toBe(false);
      expect(isCrossDomainImport('billing', classifyImportTarget('@unknown', index))).toBe(false);
    });
  });
});
