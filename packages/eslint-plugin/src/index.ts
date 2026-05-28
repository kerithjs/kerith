import { createRequire } from 'node:module';
import type { Linter } from 'eslint';
import noPrivateImports from './rules/no-private-imports.js';
import noUndeclaredImports from './rules/no-undeclared-imports.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const defaultRules = {
  'kerith/no-private-imports': 'error',
  'kerith/no-undeclared-imports': 'warn',
} satisfies Linter.RulesRecord;

const plugin = {
  meta: {
    name: '@kerith/eslint-plugin',
    version,
  },
  rules: {
    'no-private-imports': noPrivateImports,
    'no-undeclared-imports': noUndeclaredImports,
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
