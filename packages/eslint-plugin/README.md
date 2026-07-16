# @kerith/eslint

The official ESLint plugin for the **Kerith** framework. It provides static analysis rules to enforce architectural boundaries and strict dependency graphs synchronously within your IDE, ensuring that your modules remain clean, encapsulated, and fully decoupled during development.

## 📦 Installation

Ensure you have ESLint installed, then add the plugin:

```sh
npm install --save-dev eslint @kerith/eslint-plugin
```

## 🚀 Usage (Flat Config)

Kerith fully supports ESLint's modern `Flat Config` (`eslint.config.js`). Simply import the plugin and use the pre-configured `recommended` set:

```javascript
import KerithPlugin from '@kerith/eslint-plugin';

export default [
  // Your other configurations...
  
  // Apply Kerith architectural boundaries:
  KerithPlugin.configs.recommended,
];
```

Alternatively, you can manually cherry-pick and configure specific rules:

```javascript
import KerithPlugin from '@kerith/eslint-plugin';

export default [
  {
    plugins: {
      kerith: KerithPlugin
    },
    rules: {
      'kerith/no-private-imports': 'error',
      'kerith/no-undeclared-imports': 'warn'
    }
  }
];
```

## 🛠️ Rules

This plugin provides two foundational architectural guards:

| Rule | Description | Recommended |
|------|-------------|-------------|
| **`kerith/no-private-imports`** | Forbids importing private internals of other modules (e.g., `@modules/auth/auth.service`). Forces consumers to only import from the cross-module public entrypoint (`@modules/auth`). | ❌ `error` |
| **`kerith/no-undeclared-imports`** | Guarantees transparent dependency tracing. Ensures a module explicitly declares another module in its `Module({ imports: [...] })` before importing from it. | ⚠️ `warn` |
| **`kerith/no-undeclared-shared`** | Detects imports from `@shared` that are not declared in `Module({ shared: ['@shared'] })`. | ⚠️ `warn` |
| **`kerith/no-shared-scope-violation`** | Prevents accessing domain-scoped shared modules from outside the domain (e.g., importing `@billing/shared` from the `users` domain). | ❌ `error` |
| **`kerith/no-domain-boundary-violations`** | Enforces that modules do not import across domain boundaries directly. | ❌ `error` |
| **`kerith/no-relative-boundary-violations`** | Detects relative imports that cross module/submodule boundaries. | ❌ `error` |

## 📄 License

MIT License © 2026 Vlynk Studios & Keiver-dev.
