import { RuleTester } from 'eslint';
import rule from '../../src/rules/no-deep-imports.js';

import { describe, it } from 'vitest';
import * as tsParser from '@typescript-eslint/parser';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
});

tester.run('no-deep-imports', rule, {
  valid: [
    {
      // Import de @modules/users → sin reporte (index público, profundidad 0)
      code: "import { foo } from '@modules/users';",
    },
    {
      // Import de @modules/users/handlers/create → sin reporte (profundidad 1)
      code: "import { create } from '@modules/users/handlers/create';",
    },
    {
      // Profundidad 3 permitida si configuramos maxDepth: 4
      code: "import { processor } from '@modules/users/handlers/batch/legacy/processor';",
      options: [{ maxDepth: 4 }],
    },
    {
      // Other alias that doesn't start with @modules/ is ignored
      code: "import { deep } from '@core/utils/deep/very/deep';",
    }
  ],
  invalid: [
    {
      // Import de @modules/users/handlers/batch/legacy/processor → warn (profundidad 3)
      code: "import { processor } from '@modules/users/handlers/batch/legacy/processor';",
      errors: [
        {
          messageId: 'deepImport',
          data: { module: 'users' },
        },
      ],
    },
    {
      // Fallaría con profundidad 1 si configuramos maxDepth: 1
      code: "import { create } from '@modules/users/handlers/create';",
      options: [{ maxDepth: 1 }],
      errors: [
        {
          messageId: 'deepImport',
          data: { module: 'users' },
        },
      ],
    }
  ],
});
