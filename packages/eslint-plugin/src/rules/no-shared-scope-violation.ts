import type { Rule } from 'eslint';
import { getDomainFromFilePath } from '../utils/module-resolver.js';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure @{domain}/shared imports are only made within the same domain.',
      recommended: true,
    },
    messages: {
      scopeViolation: "'@{{domain}}/shared' is only available within the '{{domain}}' domain.",
    },
    schema: [],
  },
  create(context) {
    const filename =
      context.filename ||
      (context as { physicalFilename?: string }).physicalFilename ||
      (context as { getFilename?: () => string }).getFilename?.();
    if (typeof filename !== 'string') {
      return {};
    }

    return {
      ImportDeclaration(node: { source?: { value?: unknown } }) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;
        const match = specifier.match(/^@([^/]+)\/shared/);
        
        if (match) {
          const importedDomain = match[1];
          const fileDomain = getDomainFromFilePath(filename);

          if (fileDomain !== importedDomain) {
            context.report({
              node: node as Rule.Node,
              messageId: 'scopeViolation',
              data: { domain: importedDomain },
            });
          }
        }
      },
    };
  },
};

export default rule;
