import { RuleTester } from 'eslint';
import { describe, it, afterEach, beforeEach, vi } from 'vitest';
import * as tsParser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-shared-scope-violation.js';
import * as moduleResolver from '../../src/utils/module-resolver.js';

RuleTester.describe = describe;
RuleTester.it = it;

const testerJs = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const testerTs = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: tsParser,
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  moduleResolver.clearAllResolverCaches();
});

describe('no-shared-scope-violation rule', () => {
  describe('importing from own domain', () => {
    beforeEach(() => {
      vi.spyOn(moduleResolver, 'getDomainFromFilePath').mockReturnValue('billing');
    });

    const validCases = [
      { code: "import { config } from '@billing/shared';" },
      { code: "import { config } from '@billing/shared/config';" },
      { code: "import { Tax } from '@shared';" }, // Ignore global shared
    ];

    testerJs.run('no-shared-scope-violation (JS) valid', rule, {
      valid: validCases,
      invalid: [],
    });

    testerTs.run('no-shared-scope-violation (TS) valid', rule, {
      valid: validCases,
      invalid: [],
    });
  });

  describe('importing from foreign domain', () => {
    beforeEach(() => {
      vi.spyOn(moduleResolver, 'getDomainFromFilePath').mockReturnValue('users');
    });

    const invalidCases = [
      {
        code: "import { config } from '@billing/shared';",
        errors: [{ messageId: 'scopeViolation', data: { domain: 'billing' } }],
      },
      {
        code: "import { config } from '@billing/shared/config';",
        errors: [{ messageId: 'scopeViolation', data: { domain: 'billing' } }],
      },
    ];

    testerJs.run('no-shared-scope-violation (JS) invalid', rule, {
      valid: [{ code: "import { User } from '@users/shared';" }],
      invalid: invalidCases,
    });

    testerTs.run('no-shared-scope-violation (TS) invalid', rule, {
      valid: [{ code: "import { User } from '@users/shared';" }],
      invalid: invalidCases,
    });
  });

  describe('importing from undefined domain (workspace root / non-domain module)', () => {
    beforeEach(() => {
      vi.spyOn(moduleResolver, 'getDomainFromFilePath').mockReturnValue(null);
    });

    const invalidCases = [
      {
        code: "import { config } from '@billing/shared';",
        errors: [{ messageId: 'scopeViolation', data: { domain: 'billing' } }],
      },
    ];

    testerJs.run('no-shared-scope-violation (JS) no domain', rule, {
      valid: [],
      invalid: invalidCases,
    });

    testerTs.run('no-shared-scope-violation (TS) no domain', rule, {
      valid: [],
      invalid: invalidCases,
    });
  });
});
