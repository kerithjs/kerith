<div align="center">

<img src="./public/logo.svg" alt="Kerith" width="200" height="200" />

# KerithJS

**The architectural standard for Node.js and TypeScript.**

[![npm](https://img.shields.io/npm/v/@kerith/core?color=e4f222&label=%40kerith%2Fcore&style=flat-square)](https://www.npmjs.com/package/@kerith/core)
[![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin?color=e4f222&label=%40kerith%2Feslint-plugin&style=flat-square)](https://www.npmjs.com/package/@kerith/eslint-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-e4f222?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-e4f222?style=flat-square)](https://nodejs.org/)
[![kerith.dev](https://img.shields.io/badge/docs-kerith.dev-e4f222?style=flat-square)](https://docs.kerith.dev)

> **Node.js ≥ 24** · **Express 5.x** · **ESM Only** · **TypeScript included**

</div>

---

This repository is the monorepo for the KerithJS ecosystem. All packages are versioned in lockstep and published independently to npm under the `@kerith` scope.

> Notice: Ecosystem not stable, some things work others don't, everything is under constant development.

---

## Packages

| Package                                             | Description                                                                                               | Version                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`@kerith/core`](./packages/core)                   | The engine — deterministic bootstrap, module discovery, NITS identity tracking, HTTP logger, CLI          | [![npm](https://img.shields.io/npm/v/@kerith/core?style=flat-square)](https://www.npmjs.com/package/@kerith/core)                   |
| [`@kerith/eslint-plugin`](./packages/eslint-plugin) | Architectural rules enforced at edit time — before the server runs                                        | [![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin?style=flat-square)](https://www.npmjs.com/package/@kerith/eslint-plugin) |
| [`@kerith/app`](./packages/app)                     | Application layer — channel-based connection system (Alias, Middleware, Schedule, Binding)                | 🚧 in development                                                                                                                   |
| [`@kerith/identifiers`](./packages/identifiers)     | Identifier catalog — architectural identifiers consumed by `@kerith/app`'s channel loops                  | 🚧 in development                                                                                                                   |
| [`create-kerith`](./packages/create-kerith)         | Project scaffolder — generates a new project from the `core` or `app` (core + app + identifiers) template | 🚧 in development                                                                                                                   |

All packages are independent installs. `@kerith/eslint-plugin` is a companion — not a dependency of the core. `create-kerith` only depends on `@kerith/core`, `@kerith/app`, and `@kerith/identifiers` — none of those packages know it exists.

---

## Repository Structure

```
kerith/
├── packages/
│   ├── core/                        # @kerith/core
│   │   ├── src/
│   │   │   ├── bootstrap/           # createApp() — 11-step deterministic pipeline
│   │   │   ├── identifiers/         # Module() (re-export), Controller(), Service(), Repository(), Schema()
│   │   │   ├── aliases/             # ESM hook — runtime alias resolution
│   │   │   ├── nits/                # NITS — Node Identity Tracking System
│   │   │   ├── cli/                 # kerith check, create-module, sync-*, init
│   │   │   ├── core/                # Registry, state, logger, http-logger, errors
│   │   │   │   └── identifiers/     # Module(), Domain(), SubModule() — real implementations + validation
│   │   │   ├── preload/             # Runtime pre-loader hook
│   │   │   └── types/               # Public TypeScript types
│   │   └── tests/
│   │       ├── unit/                # Isolated unit tests
│   │       ├── integration/         # End-to-end bootstrap tests
│   │       └── fixtures/            # Test application stubs
│   │
│   ├── eslint-plugin/               # @kerith/eslint-plugin
│   │   └── src/
│   │       └── rules/               # no-private-imports, no-undeclared-imports, no-undeclared-shared, no-shared-scope-violation, no-deep-imports
│   │
│   ├── app/                         # @kerith/app
│   │   └── src/                     # Generic channel loops — new identifiers never require touching this layer
│   │
│   ├── identifiers/                 # @kerith/identifiers
│   │   └── src/                     # Identifier catalog, grouped by channel (Alias, Middleware, Schedule, Binding)
│   │
│   ├── create-kerith/               # create-kerith
│   │   └── src/
│   │       ├── generators/          # core-template (wraps @kerith/core/cli) + app-template (patches it to add @kerith/app + @kerith/identifiers)
│   │       ├── prompts.ts           # interactive prompts (@clack/prompts)
│   │       └── versions.ts          # resolves the installed version of core/app/identifiers at runtime
│
├── package.json                     # Workspace root
└── tsconfig.json                    # Shared TypeScript base config
```

> Note: `Module()` has two locations by design — the real implementation (registry validation, name/folder matching, caller checks) lives in `core/identifiers/module.ts`; the top-level `identifiers/module.ts` is a one-line re-export barrel that also holds `Controller()`, `Service()`, `Repository()`, and `Schema()`. `Domain()` and `SubModule()` live only under `core/identifiers/`.

---

## Development Setup

**Prerequisites:** Node.js ≥ 24, npm ≥ 10

```bash
git clone https://github.com/kerithjs/kerith.git
cd kerith
npm install
```

### Common commands

```bash
# Build all packages
npm run build

# Run all tests across the workspace
npm test

# Type-check all packages
npm run typecheck

# Lint all source and test files
npm run lint
npm run lint:fix
```

To run commands for a specific package, use the `-w` flag:

```bash
npm test -w @kerith/core
npm run build -w @kerith/eslint-plugin
```

---

## Quick Start

### Option A — Scaffold a project (recommended)

The fastest way to start is `create-kerith`, an interactive CLI that generates a ready-to-run project:

```bash
npm create kerith@alpha
```

> **Note**: During the v2 alpha cycle, use the `@alpha` tag, same as `@kerith/core`. `npm create kerith` resolves to the `create-kerith` package automatically — that's an npm convention (`npm create <name>` → `create-<name>`), not a separate tool.

It asks for a project name, a template, and a language, then writes the project and installs dependencies. Two templates are available:

- **`core`** — the minimal setup: just `@kerith/core` with a `Module()`-based structure.
- **`app`** — `core` + `@kerith/app` + `@kerith/identifiers`, with optional channel stubs (`Alias`, `Middleware`, `Cron`, `Worker`, `Gateway`) selected interactively.

Non-interactive flags are also available for scripts and CI. Note the `--` separator, required by `npm create` to pass arguments through to the underlying CLI instead of to npm itself:

```bash
npm create kerith@alpha -- my-project --yes --template app --language ts --port 3000
```

Run `npm create kerith@alpha -- --help` for the full flag list (`--template`, `--language`, `--port`, `--prefix`, `--out-dir`, `--no-install`).

### Option B — Manual setup

If you'd rather wire things up yourself:

```bash
npm install @kerith/core@alpha express
```

> **Note**: During the v2 alpha cycle, please use the `@alpha` tag to install the latest pre-release versions.

```ts
// kerith.config.ts
import { defineConfig } from "@kerith/core";

export default defineConfig({
  origin: "src",
  prefix: "/api/v1",
  rules: {
    fanOutThreshold: 8, // large monolith: higher threshold
    fanInThreshold: 5, // shared remains strict
  },
  aliases: {
    "@config": "./src/config",
    "@middleware": "./src/middleware",
  },
});
```

```ts
// src/app.ts
import express from "express";
import { createApp, useLogger, useHttpLogger } from "@kerith/core";

const app = express();
const log = useLogger("app");
const httpLog = useHttpLogger({ ignore: ["/health"] });

app.use(express.json());
app.use(httpLog.requests());

const Kerith = await createApp(app);

log.info(`Mounted ${Kerith.routes.length} route(s)`);

const server = app.listen(3000, () => {
  log.info("Server running on http://localhost:3000");
});

Kerith.listen(server);

// Error handler — must be last
app.use(httpLog.errors());
```

Each module declares itself through its `index.ts`:

```ts
// src/modules/users/index.ts
import { Module } from "@kerith/core";

Module("users", {
  imports: ["auth"],
  exports: ["UserService"],
});

export { UserService } from "./users.service.js";
```

For the full API reference, configuration options, and CLI documentation, see [docs.kerith.dev](https://docs.kerith.dev).

---

## Quality Rules

Kerith distinguishes between two types of rules:

**System Rules** — framework invariants. They have no configuration.
They guarantee that `kerith check` remains the source of truth.

**Quality Rules** — configurable warnings about design decisions.
They have sensible defaults and can be adjusted per project.

```typescript
// kerith.config.ts
export default defineConfig({
  rules: {
    maxModuleDepth: 3, // warn if a module exceeds this depth
    fanOutThreshold: 5, // warn if a module imports from more than N modules
    fanInThreshold: 5, // warn if more than N modules depend on this one
    maxModuleFiles: 30, // warn if a module has more than N files
    maxSubModulesPerModule: 5, // warn if a module has more than N SubModules
    unusedExports: true, // warn if a declared export is never used
    emptyModule: true, // warn if a module has no registered identifiers
    circularDependency: true, // warn (error with --strict)
    moduleLoadTimeout: 30_000, // ms before MODULE_LOAD_TIMEOUT
    stalePurgeCycles: 5, // bootstrap cycles before purging a stale module
  },
});
```

Any rule above can be disabled explicitly by setting it to `false` instead of omitting it.

---

## Shared Resources

Kerith provides two levels of shared code that cover the vast majority of real-world use cases:

| Type          | Alias              | Who can access              | How to declare                      |
| ------------- | ------------------ | --------------------------- | ----------------------------------- |
| Global        | `@shared`          | Any module, any domain      | `shared: ['@shared']` in `Module()` |
| Domain-scoped | `@{domain}/shared` | Only modules in that domain | Implicit — no declaration needed    |

### Global shared (`@shared`)

Place code in `src/shared/` and declare access explicitly in `Module()`:

```typescript
// src/billing/payments/index.ts
Module("payments", {
  shared: ["@shared"], // declares intent to use @shared
});

// src/billing/payments/payments.service.ts
import { format } from "@shared/format"; // valid — declared above
```

Scaffold the global shared folder:

```bash
kerith create-shared --global
# → creates src/shared/index.ts
```

### Domain-scoped shared (`@{domain}/shared`)

Place code in `src/{domain}/_shared/`. All modules **within that domain** can import from it without any declaration:

```typescript
// src/billing/payments/payments.service.ts
import { db } from "@billing/shared/db"; // implicit — same domain, no declaration needed
```

Scaffold a domain shared folder:

```bash
kerith create-shared --domain billing
# → creates src/billing/_shared/index.ts

kerith create-domain billing --shared
# → creates domain + _shared in one step
```

### Shared Best Practices

1. **Type-only Barrels**: The `index.ts` of any `_shared` or `shared` directory should be used **strictly as a type barrel** (`export type { ... }`). Never re-export runtime logic or values from it.
2. **Direct Imports**: Functions, constants, and classes should be imported **directly by their subpath** (e.g., `import { currency } from '@shop/shared/utils/currency.js'`). This works out-of-the-box thanks to Kerith's `preload-hook.ts` which automatically resolves aliases to their internal subpaths.
3. **Why?**: `export type` is erased during compilation (zero cost, zero risk of cycles). A runtime barrel, however, evaluates all its top-level exports as soon as any single item is imported, which can easily introduce circular dependencies and unintended side-effects as the domain grows.
4. **Verbatim Module Syntax**: It is highly recommended to enable `verbatimModuleSyntax: true` in your `tsconfig.json` (enabled by default in new projects scaffolded with `kerith init` or `create-kerith`). This enforces explicit `import type`/`export type` usage, preventing accidental runtime re-exports.

> **Important**: The `tsx` runtime used by `kerith dev` transpiles files in isolation. If you accidentally re-export a type as a value in a shared barrel, `tsx` will not catch it, but it will break your production build when running `tsc`. For production, always use `tsc` for the full build and run the output via `node dist/server.js`.

### Enforcement

`kerith check` detects shared violations automatically:

```
Shared
✔ @shared          — OK (used by: payments)
✔ @billing/shared  — OK (implicit for billing)
✗ @billing/shared  — SHARED_SCOPE_VIOLATION from 'workspace/members'
```

The `@kerith/eslint-plugin` enforces the same rules at edit time:

- `kerith/no-undeclared-shared` — warns when `@shared` is imported without declaring it in `shared[]`
- `kerith/no-shared-scope-violation` — errors when `@{domain}/shared` is accessed from another domain

> **Rule:** `SHARED_SCOPE_VIOLATION` always causes exit 1 during `kerith check`, even without `--strict`. A module in `workspace` has no valid reason to access `@billing/shared`. (Note: This is a static analysis check, not a runtime exception).

---

## ESLint Plugin

```bash
npm install --save-dev @kerith/eslint-plugin@alpha
```

> **Note**: During the v2 alpha cycle, use the `@alpha` tag.

```js
// eslint.config.js
import kerith from "@kerith/eslint-plugin";

export default [kerith.configs.recommended];
```

Ships five rules out of the box:

| Rule                        | Severity | Description                                                      |
| --------------------------- | -------- | ---------------------------------------------------------------- |
| `no-private-imports`        | error    | Prevents deep internal path imports                              |
| `no-undeclared-imports`     | warn     | Module uses another without declaring it in `imports[]`          |
| `no-undeclared-shared`      | warn     | `@shared` imported without declaring it in `shared[]`            |
| `no-shared-scope-violation` | error    | `@{domain}/shared` accessed from another domain                  |
| `no-deep-imports`           | warn     | Import path exceeds the configured depth (default `maxDepth: 3`) |

For full configuration details, see the [`@kerith/eslint-plugin` README](./packages/eslint-plugin/README.md).

---

## Known Limitations (v2 Alpha)

During the alpha cycle, the following known limitations apply:

- **Mode B of `kerith init`**: Running `kerith init` in a directory with an existing `package.json` (Mode B) is currently disabled. The CLI will abort to prevent unintentional overwriting of your project files. If you want to scaffold a new Kerith project, please do so in an empty directory. `create-kerith` follows the same restriction — it only scaffolds new projects and will refuse to run against a directory that already has a `package.json`.
- **`@kerith/app` and `@kerith/identifiers`**: still not published to npm. Use them through `create-kerith`'s `app` template inside this monorepo (npm workspaces resolve them locally), or as a `file:`/`workspace:` dependency until they're published.
- **`create-kerith` channel selection**: the interactive prompt offers all five channels (`Alias`, `Middleware`, `Cron`, `Worker`, `Gateway`), but there is currently no non-interactive flag to pick channels when using `--yes` — non-interactive runs generate the `app` template with no channel stubs.

---

## Versioning and Releases

All packages follow [Semantic Versioning](https://semver.org/) and are released in lockstep from this repository. Changes are documented in the `CHANGELOG.md` of each package.

> **Why does `@kerith/core` start at v2.0.0?**
> Kerith is the direct evolution of [Nodulus](https://www.npmjs.com/package/@vlynk-studios/nodulus-core), published under Vlynk Studios. The v2.0.0 release introduces the Domain Hierarchy architecture with `Domain → Module → SubModule` structure. The v1.0.0–v1.8.2 history (under the Nodulus name) is fully documented in [CHANGELOG.md](./CHANGELOG.md).

---

## Contributing

Contributions, bug reports, and feature requests are welcome. Please open an issue before submitting a pull request for non-trivial changes.

Contribution guidelines, style standards, and design principles are now documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">

Built and maintained by **[Vlynk Studios](https://github.com/vlynk-studios)** — Porto Alegre, Brasil.

[npm](https://www.npmjs.com/org/kerith) · [docs.kerith.dev](https://docs.kerith.dev) · [github.com/KerithJS](https://github.com/KerithJS)

</div>
