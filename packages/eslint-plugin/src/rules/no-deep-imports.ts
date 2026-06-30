import type { Rule } from 'eslint';

interface RuleOptions {
  maxDepth?: number;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow deep imports into a module implementation.',
      recommended: true,
    },
    messages: {
      deepImport: "Import accede a implementación profunda de '{{module}}'. Considera exponer via index.ts",
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxDepth: { type: 'number', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const maxDepth = options.maxDepth ?? 3;

    return {
      ImportDeclaration(node: { source?: { value?: unknown } }) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;

        if (!specifier.startsWith('@modules/')) {
          return;
        }

        const parts = specifier.split('/');
        
        // specifier looks like: @modules/users/handlers/batch/legacy/processor
        // parts: ['@modules', 'users', 'handlers', 'batch', 'legacy', 'processor']
        // depth is the number of directories deep (excluding the file itself)
        // depth = parts.length - 3
        const depth = parts.length - 3;
        
        if (depth >= maxDepth) {
          context.report({
            node: node as Rule.Node,
            messageId: 'deepImport',
            data: { module: parts[1] },
          });
        }
      },
    };
  },
};

export default rule;
