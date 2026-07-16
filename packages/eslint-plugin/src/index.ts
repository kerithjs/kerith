import { createRequire } from 'node:module';
import type { Linter } from 'eslint';
import noPrivateImports from './rules/no-private-imports.js';
import noUndeclaredImports from './rules/no-undeclared-imports.js';
import noUndeclaredShared from './rules/no-undeclared-shared.js';
import noSharedScopeViolation from './rules/no-shared-scope-violation.js';
import noDeepImports from './rules/no-deep-imports.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const defaultRules = {
  'kerith/no-private-imports': 'error',
  'kerith/no-undeclared-imports': 'warn',
  'kerith/no-undeclared-shared': 'warn',
  'kerith/no-shared-scope-violation': 'error',
  'kerith/no-deep-imports': ['warn', { maxDepth: 3 }],
} satisfies Linter.RulesRecord;

const plugin = {
  meta: {
    name: '@kerith/eslint-plugin',
    version,
  },
  rules: {
    'no-private-imports': noPrivateImports,
    'no-undeclared-imports': noUndeclaredImports,
    'no-undeclared-shared': noUndeclaredShared,
    'no-shared-scope-violation': noSharedScopeViolation,
    'no-deep-imports': noDeepImports,
  },
  configs: {},
};

plugin.configs = {
  recommended: {
    plugins: { kerith: plugin },
    rules: defaultRules,
  },
  'recommended-ts': {
    plugins: { kerith: plugin },
    rules: defaultRules,
  },
};

export default plugin;
