import { describe, it, expect } from 'vitest';
import { calculateAlias } from '../../src/nits/utils.js';

describe('calculateAlias()', () => {
  describe('origin mode (scanEntries provided)', () => {
    const scanEntries = [
      { name: 'users', dirPath: '/app/src/domains/auth/modules/users', domain: 'auth' },
      { name: 'billing', dirPath: '/app/src/billing', domain: 'finance' },
      { name: 'common', dirPath: '/app/src/modules/common' },
    ];

    it('resolves domain module alias @<domain>/<name>', () => {
      const alias = calculateAlias(
        '/app/src/domains/auth/modules/users/service.ts',
        scanEntries,
      );
      expect(alias).toBe('@auth/users');
    });

    it('resolves module alias without domain to @modules/<name>', () => {
      const alias = calculateAlias(
        '/app/src/modules/common/helper.ts',
        scanEntries,
      );
      expect(alias).toBe('@modules/common');
    });

    it('matches exact directory path', () => {
      const alias = calculateAlias('/app/src/billing', scanEntries);
      expect(alias).toBe('@finance/billing');
    });

    it('falls through to legacy mode when no scan entry matches', () => {
      const alias = calculateAlias(
        '/app/src/modules/unregistered/index.ts',
        scanEntries,
      );
      expect(alias).toBe('@modules/unregistered');
    });
  });

  describe('legacy heuristic mode (no scanEntries)', () => {
    it('resolves domains/<domain>/modules/<name>', () => {
      expect(
        calculateAlias('/root/domains/iam/modules/accounts/index.ts'),
      ).toBe('@iam/accounts');
    });

    it('resolves modules/<name>', () => {
      expect(
        calculateAlias('/root/src/modules/notifications/service.ts'),
      ).toBe('@modules/notifications');
    });

    it('falls back to @modules/<basename> when pattern is not standard', () => {
      expect(calculateAlias('/root/custom-dir/my-lib')).toBe('@modules/my-lib');
    });
  });
});

