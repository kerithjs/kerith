import type { Rule } from 'eslint';
import { getModuleShared, getModuleName } from '../utils/module-resolver.js';

interface RuleOptions {
  modulesDir?: string;
  projectRoot?: string;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ensure @shared is declared in the shared[] array of the module.',
      recommended: true,
    },
    messages: {
      undeclaredShared: "'@shared' is not declared in Module('{{module}}'). Add it to shared[].",
    },
    schema: [
      {
        type: 'object',
        properties: {
          modulesDir: { type: 'string' },
          projectRoot: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const modulesDir = options.modulesDir;
    const cwd = options.projectRoot ?? context.cwd ?? process.cwd();

    const filename =
      context.filename ||
      (context as { physicalFilename?: string }).physicalFilename ||
      (context as { getFilename?: () => string }).getFilename?.();
    if (typeof filename !== 'string') {
      return {};
    }

    const declaredShared = getModuleShared(filename, { modulesDir, cwd });
    if (declaredShared === null) {
      return {}; // Not in a valid module
    }

    return {
      ImportDeclaration(node: { source?: { value?: unknown } }) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;
        if (specifier === '@shared' || specifier.startsWith('@shared/')) {
          if (!declaredShared.includes('@shared')) {
            const moduleName = getModuleName(filename, { modulesDir, cwd }) || 'unknown';
            context.report({
              node: node as Rule.Node,
              messageId: 'undeclaredShared',
              data: { module: moduleName },
            });
          }
        }
      },
    };
  },
};

export default rule;
