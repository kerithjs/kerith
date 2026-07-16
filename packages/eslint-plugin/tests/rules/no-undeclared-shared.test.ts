import { RuleTester } from 'eslint';
import { describe, it, afterEach, beforeEach, vi } from 'vitest';
import * as tsParser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-undeclared-shared.js';
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

describe('no-undeclared-shared rule', () => {
  beforeEach(() => {
    vi.spyOn(moduleResolver, 'getModuleName').mockReturnValue('billing');
  });

  describe('module missing @shared in shared[]', () => {
    beforeEach(() => {
      vi.spyOn(moduleResolver, 'getModuleShared').mockReturnValue([]);
    });

    const invalidCases = [
      {
        code: "import { TaxCalculator } from '@shared';",
        errors: [{ messageId: 'undeclaredShared', data: { module: 'billing' } }],
      },
      {
        code: "import { calculate } from '@shared/utils';",
        errors: [{ messageId: 'undeclaredShared', data: { module: 'billing' } }],
      },
    ];

    testerJs.run('no-undeclared-shared (JS) invalid', rule, {
      valid: [{ code: "import { something } from './local.js';" }],
      invalid: invalidCases,
    });

    testerTs.run('no-undeclared-shared (TS) invalid', rule, {
      valid: [{ code: "import { something } from './local.js';" }],
      invalid: invalidCases,
    });
  });

  describe('module with @shared declared', () => {
    beforeEach(() => {
      vi.spyOn(moduleResolver, 'getModuleShared').mockReturnValue(['@shared']);
    });

    const validCases = [
      { code: "import { TaxCalculator } from '@shared';" },
      { code: "import { calculate } from '@shared/utils';" },
      { code: "import { something } from './local.js';" },
    ];

    testerJs.run('no-undeclared-shared (JS) valid', rule, {
      valid: validCases,
      invalid: [],
    });

    testerTs.run('no-undeclared-shared (TS) valid', rule, {
      valid: validCases,
      invalid: [],
    });
  });

  describe('file outside module', () => {
    beforeEach(() => {
      vi.spyOn(moduleResolver, 'getModuleShared').mockReturnValue(null);
    });

    const validCases = [
      { code: "import { TaxCalculator } from '@shared';" },
    ];

    testerJs.run('no-undeclared-shared (JS) outside module', rule, {
      valid: validCases,
      invalid: [],
    });

    testerTs.run('no-undeclared-shared (TS) outside module', rule, {
      valid: validCases,
      invalid: [],
    });
  });
});
