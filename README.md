<div align="center">

<img src="./public/logo.svg" alt="Kerith" width="200" height="200" />

# KerithJS

**The architectural standard for Node.js and TypeScript.**

[![npm](https://img.shields.io/npm/v/@kerith/core?color=e4f222&label=%40kerith%2Fcore&style=flat-square)](https://www.npmjs.com/package/@kerith/core)
[![npm](https://img.shields.io/npm/v/@kerith/app?color=e4f222&label=%40kerith%2Fapp&style=flat-square)](https://www.npmjs.com/package/@kerith/app)
[![npm](https://img.shields.io/npm/v/@kerith/identifiers?color=e4f222&label=%40kerith%2Fidentifiers&style=flat-square)](https://www.npmjs.com/package/@kerith/identifiers)
[![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin?color=e4f222&label=%40kerith%2Feslint-plugin&style=flat-square)](https://www.npmjs.com/package/@kerith/eslint-plugin)
[![npm](https://img.shields.io/npm/v/create-kerith?color=e4f222&label=create-kerith&style=flat-square)](https://www.npmjs.com/package/create-kerith)
[![License: MIT](https://img.shields.io/badge/license-MIT-e4f222?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0-e4f222?style=flat-square)](https://nodejs.org/)
[![kerith.dev](https://img.shields.io/badge/docs-kerith.dev-e4f222?style=flat-square)](https://docs.kerith.dev)

> **Node.js ≥ 24.0** · **Express 5.x** · **ESM Only** · **TypeScript included**

</div>

---

This repository is the monorepo for the KerithJS ecosystem. All packages are versioned in lockstep and published independently to npm under the `@kerith` scope.

---

## Packages

| Package                                             | Description                                                                                               | Version                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`@kerith/core`](./packages/core)                   | The engine — deterministic bootstrap, module discovery, NITS identity tracking, HTTP logger, CLI          | [![npm](https://img.shields.io/npm/v/@kerith/core?style=flat-square)](https://www.npmjs.com/package/@kerith/core)                   |
| [`@kerith/eslint-plugin`](./packages/eslint-plugin) | Architectural rules enforced at edit time — before the server runs                                        | [![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin?style=flat-square)](https://www.npmjs.com/package/@kerith/eslint-plugin) |
| [`@kerith/app`](./packages/app)                     | Application layer — channel-based connection system (Alias, Middleware, Schedule, Binding)                | [![npm](https://img.shields.io/npm/v/@kerith/app?style=flat-square)](https://www.npmjs.com/package/@kerith/app)                     |
| [`@kerith/identifiers`](./packages/identifiers)     | Identifier catalog — architectural identifiers consumed by `@kerith/app`'s channel loops                  | [![npm](https://img.shields.io/npm/v/@kerith/identifiers?style=flat-square)](https://www.npmjs.com/package/@kerith/identifiers)     |
| [`create-kerith`](./packages/create-kerith)         | Project scaffolder — generates a new project from the `core` or `app` (core + app + identifiers) template | [![npm](https://img.shields.io/npm/v/create-kerith?style=flat-square)](https://www.npmjs.com/package/create-kerith)                 |

All packages are independent installs. `@kerith/eslint-plugin` is a companion — not a dependency of the core. `create-kerith` only depends on `@kerith/core`, `@kerith/app`, and `@kerith/identifiers` — none of those packages know it exists.

---

## Repository Structure

```
kerith/
├── packages/
│   ├── core/                        # @kerith/core
│   │   ├── src/
│   │   │   ├── bootstrap/           # createApp() — deterministic pipeline
│   │   │   │   └── steps/           # step-00-guard (DUPLICATE_BOOTSTRAP + ESM env checks)
│   │   │   ├── identifiers/         # Module() (re-export), Controller(), Service(), Repository(), Schema()
│   │   │   ├── aliases/             # ESM hook — runtime alias resolution
│   │   │   │   └── matcher.ts       # createAliasMatcher() — O(1) deterministic resolver
│   │   │   ├── nits/                # NITS — Node Identity Tracking System
│   │   │   ├── cli/                 # kerith check, create-module, sync-*, init
│   │   │   │   └── lib/             # violations.ts, graph-builder, cycle-detector, import-classifier
│   │   │   ├── core/                # Registry, state, logger, http-logger, errors
│   │   │   │   └── identifiers/     # Module(), Domain(), SubModule() — real implementations + validation
│   │   │   ├── preload/             # Runtime pre-loader hook
│   │   │   └── types/               # Public TypeScript types
│   │   └── tests/
│   │       ├── unit/                # Isolated unit tests
│   │       ├── integration/         # End-to-end bootstrap tests
│   │       ├── audit/               # Audit test suite (R8–R15, R10a–R10e)
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

**Prerequisites:** Node.js ≥ 24.0, [pnpm](https://pnpm.io) ≥ 9

```bash
git clone https://github.com/kerithjs/kerith.git
cd kerith
pnpm install
```

### Common commands

All root scripts delegate to **Turborepo**, which respects the dependency graph, runs tasks in parallel where safe, and caches results locally in `.turbo/`.

```bash
# Build all packages (respects dependency order: core → identifiers → app, etc.)
pnpm run build

# Run all tests across the workspace
pnpm test

# Type-check all packages
pnpm run typecheck

# Lint all source and test files
pnpm run lint
pnpm run lint:fix
```

To run a command for a specific package, use `--filter`:

```bash
pnpm --filter @kerith/core test
pnpm --filter @kerith/eslint-plugin build
```

> **Turborepo cache:** The second run of any unchanged package will show `cache hit` and finish in milliseconds. To force a clean run, pass `--force` to turbo: `pnpm run build -- --force`.

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

## `kerith check` — Structural Analysis CLI

`kerith check` is the primary static analysis command. It scans the project, builds a module graph, and reports all architectural violations without starting the server.

```bash
kerith check
```

### Flags

| Flag | Description |
| --- | --- |
| `--strict` | Exit with code 1 if **any** violation is found (including quality warnings) |
| `--module <name>` | Filter analysis to a single module |
| `--level <domain\|module\|submodule\|flat>` | Filter the output section shown in the report |
| `--format <text\|json>` | Output format — `text` (default) or machine-readable `json` |
| `--no-circular` | Skip circular dependency detection |
| `--verbose` | Show verbose output including internal NITS IDs |

### Exit behavior

- **System violations** (e.g. `DOMAIN_BOUNDARY_VIOLATION`, `RELATIVE_BOUNDARY_VIOLATION`, `SHARED_SCOPE_VIOLATION`) → always exit 1.
- **Quality warnings** (e.g. fan-in/fan-out, `CIRCULAR_DEPENDENCY`, `UNUSED_EXPORT`) → exit 0 normally, exit 1 with `--strict`.

---

## Violation Reference

Kerith separates violations into two categories.

### System Violations (always exit 1)

These are hard architectural invariants. They cannot be disabled.

| Code | Trigger |
| --- | --- |
| `UNDECLARED_IMPORT` | Module imports another without declaring it in `imports[]` |
| `RELATIVE_BOUNDARY_VIOLATION` | A relative `../` import escapes the module boundary |
| `DOMAIN_BOUNDARY_VIOLATION` | A module imports from another domain's internal alias (e.g. `@billing/orders` from `workspace`) |
| `SHARED_SCOPE_VIOLATION` | A module in a foreign domain imports `@{domain}/shared` |
| `UNDECLARED_SHARED` | A module imports `@shared` without declaring it in `shared[]` |
| `SHARED_IN_IMPORTS` | A shared alias was placed in `imports[]` instead of `shared[]` |
| `MODULE_IN_SHARED` | A module name was placed in `shared[]` instead of `imports[]` |
| `MODULE_SPACE_CONFLICT` | A module name exists in both flat space and domain space |

### Quality Warnings (configurable)

These are design signals, not framework invariants. They become blocking only with `--strict`.

| Code | Trigger |
| --- | --- |
| `CIRCULAR_DEPENDENCY` | Circular import chain detected (disable with `--no-circular`) |
| `FAN_OUT_HIGH` | Module imports from more modules than `fanOutThreshold` |
| `FAN_IN_HIGH` | More modules depend on this one than `fanInThreshold` |
| `MODULE_DEPTH_EXCEEDED` | Module nesting exceeds `maxModuleDepth` |
| `MODULE_TOO_LARGE` | Module has more files than `maxModuleFiles` |
| `TOO_MANY_SUBMODULES` | Module declares more SubModules than `maxSubModulesPerModule` |
| `UNUSED_EXPORT` | A declared export is never consumed by any other module |
| `EMPTY_MODULE` | Module has no registered identifiers |
| `UNUSED_SHARED` | Module declares `@shared` in `shared[]` but no file imports it |
| `PRIVATE_IMPORT` | Direct deep path import into another module's internals |
| `SUBMODULE_DIRECT_SIBLING` | SubModule imports a sibling SubModule directly |
| `SUBMODULE_DOMAIN_BYPASS` | SubModule imports its own domain root barrel (`@{domain}`) |

### Runtime Errors

Thrown by `createApp()` and the bootstrap pipeline at startup.

| Code | Trigger |
| --- | --- |
| `DUPLICATE_BOOTSTRAP` | `createApp()` called more than once (same app instance, or same process) |
| `INVALID_ESM_ENV` | Project `package.json` does not declare `"type": "module"` |
| `DUPLICATE_MODULE` | Two modules registered with the same name |
| `DUPLICATE_DOMAIN` | Two domains registered with the same name |
| `CIRCULAR_DEPENDENCY` | Circular import detected during bootstrap |
| `ALIAS_CONFLICT` | Two aliases resolve to conflicting targets |
| `ALIAS_RESERVED` | An alias key conflicts with a Kerith-reserved name |
| `MODULE_LOAD_TIMEOUT` | A module failed to load within `moduleLoadTimeout` ms |
| `PRELOADER_REQUIRED` | Alias hook not registered before `createApp()` |
| `PRELOADER_VERSION_MISMATCH` | Preload file version differs from installed `@kerith/core` |
| `MISSING_PEER_DEPENDENCY` | A required peer (e.g. `bullmq`, `node-cron`) is not installed |
| `INVALID_CRON_EXPRESSION` | A `Cron()` identifier has an invalid cron expression |
| `BINDING_EXECUTION_FAILED` | A BindingProvider failed during its `bind()` execution |
| `MIDDLEWARE_RESOLUTION_FAILED` | A MiddlewareResolver threw during `getHandlers()` |

---

## Bootstrap Pipeline

`createApp()` runs a deterministic, ordered pipeline before returning. Each step is isolated and throws a `KerithError` with a typed code on failure.

**Step 00 — Precondition Guards** (runs before any state is created):

1. **Duplicate instance guard** — throws `DUPLICATE_BOOTSTRAP` if the same Express app is passed twice.
2. **Process-level singleton guard** — throws `DUPLICATE_BOOTSTRAP` if `createApp()` is called more than once in the same process (sequential or concurrent via `Promise.all`).
3. **ESM environment guard** — throws `INVALID_ESM_ENV` if `"type": "module"` is absent from `package.json`.

The process-level guard implements a three-state machine (`idle → booting → booted`). On failure, the state reverts to `idle` automatically, so a corrected second call can proceed without manual cleanup.

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
    maxModuleDepth: 3,        // warn if a module exceeds this depth
    fanOutThreshold: 5,       // warn if a module imports from more than N modules
    fanInThreshold: 5,        // warn if more than N modules depend on this one
    maxModuleFiles: 30,       // warn if a module has more than N files
    maxSubModulesPerModule: 5,// warn if a module has more than N SubModules
    unusedExports: true,      // warn if a declared export is never used
    emptyModule: true,        // warn if a module has no registered identifiers
    circularDependency: true, // warn (error with --strict)
    moduleLoadTimeout: 30_000,// ms before MODULE_LOAD_TIMEOUT
    stalePurgeCycles: 5,      // bootstrap cycles before purging a stale module
  },
});
```

Any rule above can be disabled explicitly by setting it to `false` instead of omitting it.

---

## ESM Alias Resolution

Kerith resolves aliases via a Node.js ESM customization hook (`--import` flag). The resolution order is **deterministic regardless of alias insertion order**:

1. **Exact match** — O(1) via `Map` (`@billing/orders` → specific `index.ts`)
2. **Wildcard** — longest base first (`@billing/*` → any sub-path under billing)
3. **Implicit prefix** — longest prefix first (bare alias used as directory root)
4. **Pass-through** — delegated to Node's default resolver

This logic lives in [`createAliasMatcher()`](./packages/core/src/aliases/matcher.ts) and is the fix for BUG-02 (prefix match incorrectly winning over exact match). It also correctly handles Windows paths where the trailing `\*` wildcard separator differs from Unix `/\*`.

Configure aliases in `kerith.config.ts`:

```ts
export default defineConfig({
  aliases: {
    "@users":        "./src/users",
    "@users/*":      "./src/users/*",
    "@billing":      "./src/billing",
    "@billing/*":    "./src/billing/*",
    "@shared":       "./src/shared",
  },
});
```

> **Tip:** Run `kerith sync-preload` after changing aliases to regenerate `.kerith/preload.js`. The preloader is verified on every `kerith check` run — a version mismatch triggers a warning.

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

## NITS — Node Identity Tracking System

NITS is an identity layer that assigns each module a stable UUID that **survives renames, moves, and refactors**. It runs automatically during `kerith check` and `createApp()`.

- **Shadow files** (`.kerith/nits/<module>.json`) persist the UUID alongside a content hash.
- On each run the reconciler compares the current module graph against the registry: confirmed, moved, candidate (content-similar), new, stale, and deleted.
- Stale modules are purged after `stalePurgeCycles` runs (configurable).
- The `--verbose` flag on `kerith check` prints internal NITS IDs for each module in the report.

NITS can be disabled in `kerith.config.ts`:

```ts
export default defineConfig({
  nits: { enabled: false },
});
```

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

## Testing Utilities

`@kerith/core` exports `resetGlobalState()` for use in test teardown. It resets all in-process Kerith state (alias cache, alias resolver options, and bootstrap guard) to `idle`, preventing state leakage between test runs:

```ts
import { resetGlobalState } from "@kerith/core";

afterEach(() => {
  resetGlobalState();
});
```

> **Internal:** `resetGlobalState()` is not part of the public production API — it is intended only for test environments. The function resets the same bootstrap guard state that `DUPLICATE_BOOTSTRAP` relies on, so calling it in production code would allow multiple `createApp()` calls in the same process.

---

## Known Limitations (v2 Alpha)

During the alpha cycle, the following known limitations apply:

- **Mode B of `kerith init`**: Running `kerith init` in a directory with an existing `package.json` (Mode B) is currently disabled. The CLI will abort to prevent unintentional overwriting of your project files. If you want to scaffold a new Kerith project, please do so in an empty directory. `create-kerith` follows the same restriction — it only scaffolds new projects and will refuse to run against a directory that already has a `package.json`.

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
