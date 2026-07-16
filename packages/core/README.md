<div align="center">

<img src="../../public/logo.svg" alt="Kerith" width="200" height="200" />

# @kerith/core

**The architecture engine — deterministic bootstrap, module discovery, NITS identity tracking, HTTP logging, and CLI.**

[![npm](https://img.shields.io/npm/v/@kerith/core?color=e4f222&label=%40kerith%2Fcore&style=flat-square)](https://www.npmjs.com/package/@kerith/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-e4f222?style=flat-square)](../../LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.6-e4f222?style=flat-square)](https://nodejs.org/)

> **Node.js ≥ 20.6** · **Express 5.x (peer, optional)** · **ESM Only** · **TypeScript included**

</div>

---

This is the README for **`@kerith/core`** specifically. For the ESLint plugin, see [`packages/eslint-plugin`](../eslint-plugin). For the monorepo overview, see the [root README](../../README.md).

> **Notice:** This package is under active development. Some documented behavior reflects the current `v2.0.0` implementation exactly as found in `src/` — version markers (`@since vX.X.X`) are included where the source annotates them.

---

## Table of contents

1. [Why Kerith](#why-kerith)
2. [Installation & requirements](#installation--requirements)
3. [Quick start](#quick-start)
4. [Project structure](#project-structure)
5. [Identifiers](#identifiers)
6. [Import aliases](#import-aliases)
7. [Module boundaries](#module-boundaries)
8. [Shared resources](#shared-resources)
9. [The pre-loader system](#the-pre-loader-system)
10. [`kerith.config.ts` reference](#kerithconfigts-reference)
11. [Runtime Zero & bootstrap cache](#runtime-zero--bootstrap-cache)
12. [API reference](#api-reference)
13. [HTTP request logging](#http-request-logging)
14. [Graceful shutdown](#graceful-shutdown)
15. [Error handling](#error-handling)
16. [CLI reference](#cli-reference)
17. [`kerith check` — architecture violations](#kerith-check--architecture-violations)
18. [NITS — module identity tracking](#nits--module-identity-tracking)
19. [TypeScript types](#typescript-types)
20. [Requirements](#requirements)
21. [License](#license)

---

## Why Kerith

Express is minimal by design. `@kerith/core` keeps it that way while adding just enough structure to scale:

- **Module discovery** — point it at `src/modules/*` (flat mode) or `src` (domain mode) and it finds, validates, and loads every module automatically.
- **Route mounting** — controllers declare their prefix; `createApp()` wires them to Express via `app.use()`.
- **Import aliases** — `@modules/users`, `@billing/payments`, `@config/database` — no more `../../..` paths.
- **Dependency validation** — declare what your module imports and exports; Kerith catches mismatches before a single request is handled.
- **No magic at runtime** — after bootstrap, Kerith is out of the way. Express handles requests exactly as normal.
- **Worker-mode support** — `createApp()` no longer requires an Express instance. Background workers and scheduled jobs can use the same registry, aliases, and graceful shutdown without HTTP at all.

---

## Installation & requirements

```bash
npm install @kerith/core@alpha
```

> **Note**: During the v2 alpha cycle, please use the `@alpha` tag to install the latest pre-release versions.

Express is a **peer dependency** — and it's optional if you're not mounting HTTP routes (see [worker mode](#quick-start)):

```bash
npm install express
```

Your project's root `package.json` **must** declare:

```json
{ "type": "module" }
```

Kerith validates this at the very start of `createApp()` and throws `INVALID_ESM_ENV` if it's missing — before touching the filesystem or the config.

| Requirement   | Minimum                                                     |
| ------------- | ----------------------------------------------------------- |
| Node.js       | 20.6.0 (required for the native ESM Hooks `register()` API) |
| Express       | 5.x (peer dependency, only needed for HTTP mode)            |
| TypeScript    | 5.0+ (optional — types are bundled)                         |
| Module system | ESM (`"type": "module"`)                                    |

---

## Quick start

### HTTP mode (Express)

```ts
import express from "express";
import { createApp } from "@kerith/core";

const app = express();
const kerith = await createApp(app);

const server = app.listen(3000);
kerith.listen(server);
```

### Worker mode — no Express, no HTTP _(since v2.0.0)_

`app` is now an **optional** first argument. When omitted, `createApp()` still runs the full pipeline — config load, module discovery, alias activation, NITS reconciliation, dependency validation — it simply skips controller discovery and route mounting (Step 08 is a no-op without an `Application` instance). This makes Kerith usable for background workers, queue consumers, or scheduled-job services that still want module boundaries, aliases, and graceful shutdown:

```ts
import { createApp } from "@kerith/core";
import http from "node:http";

const kerith = await createApp(); // no Express app

// You can still register a graceful-shutdown hook against any http.Server:
const server = http.createServer((_, res) => res.end("healthcheck"));
kerith.listen(server, {
  onShutdown: async () => {
    await queue.close();
  },
});
```

> **Alias resolution note:** Alias resolution runs through the Node.js ESM Hooks API, which activates inside `createApp()` during Step 05 of the bootstrap. Aliases are available to any file Kerith dynamically imports during bootstrap (your modules). They are **not** available to static top-level imports in your entry point file _unless the [pre-loader](#the-pre-loader-system) is active_.

---

## Project structure

Kerith infers your architecture from the filesystem. Place your identifiers in `index.ts` files and Kerith builds the hierarchy automatically. Two scanning modes are supported simultaneously and can be adopted incrementally — see [`MIGRATION.md`](./MIGRATION.md).

### v2 — Domain hierarchy (`origin` config)

```
src/
  billing/
    index.ts              ← Domain('billing')
    _shared/               ← domain-scoped shared code
    payments/
      index.ts            ← Module('payments', { imports: ['invoices'] })
      payments.service.ts
      submodules/
        trial/
          index.ts        ← SubModule('trial')
    invoices/
      index.ts            ← Module('invoices', { exports: ['InvoiceService'] })
  users/
    index.ts              ← Module('users')   ← flat module, no domain
  shared/                  ← global shared code
```

```js
// kerith.config.js
export default { origin: "src" };
```

Every discovered module — flat or domain-scoped — gets a `@modules/<name>` alias. Domain-scoped modules **additionally** get a domain-qualified alias:

```ts
import { InvoiceService } from "@billing/invoices"; // domain-qualified alias
import { PaymentService } from "@modules/payments"; // always available too
import { UserService } from "@modules/users"; // flat module, no domain
```

### v1 — Flat modules (`modules` glob)

```
src/
  modules/
    users/
      index.ts            ← Module('users', ...)
      users.routes.ts     ← controller (discovered automatically)
      users.service.ts    ← private business logic
    payments/
      index.ts            ← Module('payments', ...)
```

```js
// kerith.config.js
export default { modules: "src/modules/*" };
```

`modules` and `origin` are mutually exclusive at resolution time: if `origin` is set, it always takes precedence and `modules` is ignored. If neither is set, `origin` defaults to `'src'`. `modules` is documented as **deprecated** in favor of `origin`, but remains fully supported — v1.x projects work unmodified.

---

## Identifiers

Identifiers are plain function calls executed once when their file is imported. They are not decorators — they write into an `AsyncLocalStorage`-scoped registry that only exists during a `createApp()` execution. Calling any identifier outside that context throws `REGISTRY_MISSING_CONTEXT`.

### `Domain(name, options?)`

Declares a domain boundary. Must be called from the domain's `index.ts`; `name` **must** equal the folder name (`INVALID_DOMAIN_DECLARATION` otherwise).

```ts
// src/billing/index.ts
import { Domain } from "@kerith/core";
Domain("billing", { description: "Billing and payments domain" });
```

| Option        | Type     | Description                             |
| ------------- | -------- | --------------------------------------- |
| `description` | `string` | Documentation only — no runtime effect. |

`Domain()` does not accept an `imports`/`exports` option — domains are pure filesystem groupings, not dependency units.

### `Module(name, options?)`

Declares a module. Must be called from the module's `index.ts`; `name` **must** equal the containing folder name (`INVALID_MODULE_DECLARATION` otherwise).

```ts
// src/modules/orders/index.ts (or src/billing/orders/index.ts)
import { Module } from "@kerith/core";

Module("orders", {
  description: "Purchase order management",
  imports: ["users", "payments"],
  exports: ["OrderService", "createOrderSchema"],
  shared: ["@shared"],
});

export { OrderService } from "./orders.service.js";
export { createOrderSchema } from "./orders.schema.js";
```

| Option        | Type       | Description                                                                                                                                                                                       |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imports`     | `string[]` | Modules this module depends on (within the same domain).                                                                                                                                          |
| `exports`     | `string[]` | Public API — validated against real `index.ts` exports at bootstrap.                                                                                                                              |
| `shared`      | `string[]` | Global shared resources this module uses. Only accepts `'@shared'` or subpaths of it (`'@shared/utils'`). Access to `'@{domain}/shared'` is **implicit** for domain members — never list it here. |
| `description` | `string`   | Documentation only.                                                                                                                                                                               |

> The domain a module belongs to is **always inferred from its filesystem location**, never passed as an option.

### `SubModule(name, options?)`

Declares an implementation unit nested inside a module, at `<module>/submodules/<name>/`. Must be called from its `index.ts`; `name` **must** equal the folder name (`INVALID_SUBMODULE_DECLARATION` otherwise).

```ts
// src/billing/payments/submodules/trial/index.ts
import { SubModule } from "@kerith/core";
SubModule("trial", { description: "Free-trial billing logic" });
```

| Option        | Type     | Description         |
| ------------- | -------- | ------------------- |
| `description` | `string` | Documentation only. |

`SubModule()` accepts **no** `imports`/`exports` — it's a scoped implementation detail of its parent, not an independently addressable dependency unit. Boundary rules (see [`kerith check`](#kerith-check--architecture-violations)) enforce that a submodule reaches siblings only through its parent module, and never imports the domain root directly. Parent module and domain are inferred automatically from the path; if no registered module exists as an ancestor, `PARENT_MODULE_NOT_FOUND` is thrown. Nesting a `SubModule` inside another `SubModule` throws `SUBMODULE_NESTED`.

### `Controller(prefix, options?)`

Declares a file as an Express controller. The controller name is derived from the filename. The file **must** have a `default export` of an Express `Router`.

```ts
// src/modules/users/users.routes.ts
import { Controller } from "@kerith/core";
import { Router } from "express";

Controller("/users", { middlewares: [requireAuth] });

const router = Router();
router.get("/", async (req, res, next) => {
  /* ... */
});
export default router;
```

| Option        | Type               | Default | Description                                                          |
| ------------- | ------------------ | ------- | -------------------------------------------------------------------- |
| `middlewares` | `RequestHandler[]` | `[]`    | Applied to all routes in this controller, mounted before the router. |
| `enabled`     | `boolean`          | `true`  | If `false`, `createApp()` ignores this controller entirely.          |

Kerith mounts each controller as `app.use(globalPrefix + controllerPrefix, ...middlewares, router)`. Modules with **no** controllers are perfectly valid (workers, listeners, background modules) — this is enforced by design, not just tolerated.

### `Service(name, options?)` / `Repository(name, options?)` / `Schema(name, options?)`

Optional identity/documentation markers registered into the Kerith registry — they never alter runtime behavior. Each name must be **globally unique** (`DUPLICATE_SERVICE` / `DUPLICATE_REPOSITORY` / `DUPLICATE_SCHEMA`).

```ts
import { Service, Repository, Schema } from "@kerith/core";
import { z } from "zod";

Service("UserService");
Repository("UserRepository", { source: "database" });
Schema("CreateUserSchema", { library: "zod" });

export const UserService = {
  /* ... */
};
```

| Function     | Extra option | Type                                                 | Description              |
| ------------ | ------------ | ---------------------------------------------------- | ------------------------ |
| `Service`    | —            | —                                                    | —                        |
| `Repository` | `source`     | `'database' \| 'api' \| 'cache' \| 'file' \| string` | Data source type.        |
| `Schema`     | `library`    | `'zod' \| 'joi' \| 'yup' \| 'ajv' \| string`         | Validation library used. |

All three also accept `module?: string` (inferred from the parent folder name if omitted) and `description?: string`. These are surfaced via `getRegistry().getAllServices() / getAllRepositories() / getAllSchemas()`.

---

## Import aliases

Kerith registers several kinds of aliases automatically, plus any you configure:

- **Module aliases** — auto-generated for **every** discovered module, flat or domain-scoped:
  ```
  @modules/<name> → <module>/index.ts
  ```
- **Domain aliases** — auto-generated for domains and domain-scoped modules:
  ```
  @<domain>           → <domain folder>
  @<domain>/<module>  → <module>/index.ts
  ```
- **Shared aliases** — `@shared` (global) and `@<domain>/shared` (domain-scoped) — see [Shared resources](#shared-resources).
- **Config aliases** — defined in `kerith.config.ts` and take precedence over auto-generated ones:
  ```ts
  export default defineConfig({
    aliases: {
      "@config": "./src/config", // directory — subpaths supported automatically
      "@db": "./src/config/db.ts", // file — resolves exactly to that file
    },
  });
  ```

Alias **keys** are validated when the config file loads (before any scan runs):

- Must match `/^@[a-zA-Z][a-zA-Z0-9-]*$/` — otherwise throws `INVALID_ALIAS_KEY`.
- Cannot be `@modules`, `@shared`, or the bare `@` — these are reserved and throw `ALIAS_RESERVED`.
- If the resolved target path does not exist on disk, Kerith logs a `warn` (does not throw).

```ts
import { UserService } from "@modules/users";
import { db } from "@config/database.js";
```

> [!IMPORTANT]
> Kerith is **ESM-only**. Runtime alias resolution uses the Node.js ESM Hooks API and activates inside `createApp()`. Aliases are **not** available in your entry point before `createApp()` is called, unless the pre-loader is active.

### Alias resolution with bundlers

For bundler-based projects (Vite, esbuild, etc.), disable the runtime hook and inject `getAliases()` into your bundler config instead:

```ts
// vite.config.ts
import { createApp, getAliases } from "@kerith/core";

await createApp(); // worker-mode bootstrap populates the in-memory alias cache
const aliases = await getAliases({ absolute: true });

export default {
  resolve: { alias: aliases },
};
```

```ts
// esbuild.config.ts
import { createApp, getAliases } from "@kerith/core";
import * as esbuild from "esbuild";

await createApp();
const aliases = await getAliases({ absolute: true });

await esbuild.build({
  entryPoints: ["src/index.ts"],
  alias: aliases,
  bundle: true,
  outfile: "dist/app.js",
});
```

> **Note:** `getAliases()` reads from an in-memory cache populated by `createApp()` in the same process (via `updateAliasCache()` during Step 05). Calling it before any bootstrap has run in the current process returns an empty object — always `await createApp()` (worker mode is enough; no `app` argument required) before calling `getAliases()`.

`getAliases(options?)`:

| Option                 | Type      | Default | Description                                                                                     |
| ---------------------- | --------- | ------- | ----------------------------------------------------------------------------------------------- |
| `includeFolders`       | `boolean` | `true`  | If `false`, config-defined aliases are excluded (only `@modules/*` returned).                   |
| `includeConfigAliases` | `boolean` | `true`  | Same effect as `includeFolders`, more descriptive name. Takes precedence when both are present. |
| `absolute`             | `boolean` | `false` | Return absolute paths instead of relative POSIX paths.                                          |

`resolveAlias(alias: string): string | undefined` resolves a single alias from the same cache.

---

## Module boundaries

`@` always crosses into another module. `./` and `../` always stay within the current module.

```ts
import { X } from "./local-file"; // ✅ internal to the module
import { X } from "@modules/payments"; // ✅ declared cross-module connection
import { X } from "../payments/service"; // ❌ RELATIVE_BOUNDARY_VIOLATION
```

A relative path that escapes the module directory is **always** a hard error in `kerith check` (`severity: 'error'`, exit 1 regardless of `--strict`). Fix it by declaring the import in `imports[]` and using the corresponding alias.

In domain mode, reaching into another domain's internal module directly is a **domain boundary violation** (also `severity: 'error'`, always exit 1):

```ts
import { X } from "@billing/payments"; // ❌ from outside 'billing' — DOMAIN_BOUNDARY_VIOLATION
import { X } from "@billing"; // ✅ the domain's public surface is always importable
```

---

## Shared resources

Kerith provides two levels of shared code, both bootstrap-validated:

**Global shared** (`@shared`) — available to any module in any domain. Place code in `src/shared/` and declare access explicitly:

```ts
Module("payments", {
  shared: ["@shared"],
});
```

**Domain-scoped shared** (`@{domain}/shared`) — available implicitly to every module _in that domain_. Place code in `src/{domain}/_shared/`. No declaration needed:

```ts
// src/billing/payments/payments.service.ts
import { db } from "@billing/shared/db"; // implicit access — no declaration needed
```

### Validation rules (enforced at bootstrap)

| Rule                                                                              | Behavior                                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A module name (not `@shared`/`@shared/*`) is placed in `shared[]`                 | Should be in `imports[]` instead. Throws `SHARED_IN_IMPORTS` in strict mode; `log.warn` otherwise. |
| A `@shared`-family alias is placed in `imports[]`                                 | Should be in `shared[]` instead. Throws `SHARED_IN_IMPORTS` in strict mode; `log.warn` otherwise.  |
| `shared[]` contains something that isn't `'@shared'` or a `'@shared/...'` subpath | Throws `UNDECLARED_SHARED` in strict mode; `log.warn` otherwise.                                   |
| `shared: ['@shared']` is declared but no global `src/shared/` folder exists       | Throws `UNDECLARED_SHARED` in strict mode; `log.warn` otherwise.                                   |

`UNUSED_SHARED` (declared but never actually imported) and `SHARED_SCOPE_VIOLATION` (a module from a foreign domain imports `@{domain}/shared`) are **not** thrown at bootstrap — they're detected exclusively by [`kerith check`](#kerith-check--architecture-violations), where `SHARED_SCOPE_VIOLATION` is a hard error and `UNUSED_SHARED` is a warning.

---

## The pre-loader system

By default, the ESM alias hook activates **inside** `createApp()`. This means aliases like `@config/database` are **not** available in static top-level imports in your server entry file unless the pre-loader is active:

```ts
// ❌ Fails without the pre-loader
import { db } from "@config/database.js"; // MODULE_NOT_FOUND

const app = express();
await createApp(app);
```

### Automatic setup — `kerith dev`

`kerith dev` runs `sync-preload` and `sync-tsconfig` internally, silently, before every start. **You no longer need to chain them manually** — this is handled for you:

```json
{
  "scripts": {
    "dev": "kerith dev src/server.ts",
    "start": "node --import ./.kerith/preload.js src/server.ts"
  }
}
```

### Manual setup (e.g. for `start`, or CI)

```bash
npx kerith sync-preload
```

This creates `.kerith/preload.js` — **commit it to version control**. It contains only resolved paths (no secrets) and lets `start` scripts and CI/CD run without regenerating it at deploy time.

```ts
// ✅ Works once the pre-loader is active
import { db } from "@config/database.js";
import { UserService } from "@modules/users";

const app = express();
const { runtime } = await createApp(app);
console.log(runtime.preloaderActive); // true
```

Re-run `kerith sync-preload` manually whenever you:

- Add/remove/change aliases in `kerith.config.ts` while the server isn't running.
- Move the project to a different absolute path (the pre-loader embeds absolute paths).

### Legacy mode

If `.kerith/preload.js` is missing, Kerith falls back to legacy mode: aliases still work **inside** modules discovered by `createApp()`, but not in top-level entry-file imports. A `warn` log is emitted during bootstrap. If the pre-loader exists but was generated by a different `@kerith/core` version, a `PRELOADER_VERSION_MISMATCH` warning is logged (not thrown).

---

## `kerith.config.ts` reference

```ts
import { defineConfig } from "@kerith/core";

export default defineConfig({
  origin: "src",
  prefix: "/api/v1",
  strict: true,
  aliases: { "@config": "./src/config" },
  rules: {
    fanOutThreshold: 8, // large monolith: higher threshold
  },
});
```

Config candidates are searched **in this order** from `cwd`, first match wins: `kerith.config.ts` → `kerith.config.js` → `kerith.config.mjs`. If a `.ts` file is found but the runtime can't execute raw TypeScript (no loader like `tsx` registered), Kerith throws a descriptive error rather than silently falling back to a `.js` file — pick one file, not several.

| Field                      | Type                                     | Default                                                                      | Description                                                                                                                                                       |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`                   | `string`                                 | `'src'` (if `modules` is also unset)                                         | Scan root for the v2 `Domain → Module → SubModule` hierarchy. Takes precedence over `modules` when both are set.                                                  |
| `modules`                  | `string`                                 | —                                                                            | **Deprecated**, replaced by `origin`. v1.x flat-module glob, e.g. `'src/modules/*'`.                                                                              |
| `prefix`                   | `string`                                 | `''`                                                                         | Global HTTP route prefix.                                                                                                                                         |
| `strict`                   | `boolean`                                | `true` in dev, `false` when `NODE_ENV=production`                            | Enables `MISSING_IMPORT`, `UNDECLARED_IMPORT`, `UNUSED_IMPORT`, `CIRCULAR_DEPENDENCY`, and hard-fails `SHARED_IN_IMPORTS`/`UNDECLARED_SHARED` instead of warning. |
| `resolveAliases`           | `boolean`                                | `true`                                                                       | If `false`, the runtime ESM alias hook is not activated (use `getAliases()` with a bundler instead).                                                              |
| `logLevel`                 | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` (or `KERITH_LOG_LEVEL` / `debug` if `NODE_DEBUG` includes `kerith`) | Minimum severity emitted.                                                                                                                                         |
| `logFormat`                | `'pretty' \| 'json' \| 'auto'`           | `'auto'` (`json` if `NODE_ENV=production`, else `pretty`)                    | Log output format.                                                                                                                                                |
| `requirePreloader`         | `boolean`                                | `false`                                                                      | If `true`, throws `PRELOADER_REQUIRED` when the process wasn't started with `--import ./.kerith/preload.js`.                                                      |
| `nits.enabled`             | `boolean`                                | `true`                                                                       | Enables NITS identity tracking.                                                                                                                                   |
| `nits.similarityThreshold` | `number`                                 | `0.9`                                                                        | Jaccard similarity threshold used by NITS Step 2 (hash-based match).                                                                                              |
| `aliases`                  | `Record<string, string>`                 | `{}`                                                                         | User alias map — see [Import aliases](#import-aliases).                                                                                                           |
| `logging.maxRouteLines`    | `number`                                 | `5`                                                                          | Max number of mounted routes logged per module during bootstrap.                                                                                                  |
| `rules`                    | `QualityRulesConfig`                     | see below                                                                    | Architectural quality rules — see next section.                                                                                                                   |

### Quality rules

All rules live under the single `rules` key. Numeric/boolean rules accept `false` to disable them explicitly (except `moduleLoadTimeout` and `stalePurgeCycles`, which always require a positive number).

```ts
export default defineConfig({
  rules: {
    maxModuleDepth: 3, // warn if a module exceeds this folder depth
    fanOutThreshold: 5, // warn if a module imports from more than N modules
    fanInThreshold: 5, // warn if more than N modules depend on this one
    maxModuleFiles: 30, // warn if a module has more than N files
    maxSubModulesPerModule: 5, // warn if a module has more than N SubModules
    unusedExports: true, // warn if a declared export is never used
    emptyModule: true, // warn if a module has no registered identifiers
    circularDependency: true, // warn (error with --strict)
    moduleLoadTimeout: 30_000, // ms before MODULE_LOAD_TIMEOUT during bootstrap
    stalePurgeCycles: 5, // bootstrap cycles before purging a stale NITS module
  },
});
```

`fanOutThreshold` / `fanInThreshold` are the **only** configuration surface for coupling detection — there is no separate top-level `coupling` config block. To effectively disable a threshold, set it to `Number.MAX_SAFE_INTEGER` (do not use `Infinity` — it serializes to `null` in JSON output):

```ts
rules: {
  fanOutThreshold: Number.MAX_SAFE_INTEGER;
}
```

All quality-rule violations (`fan-out-high`, `fan-in-high`, `module-depth-exceeded`, `module-too-large`, `too-many-submodules`, `unused-export`, `empty-module`, and `circular-dependency` as a _quality-rule_ warning) have `severity: 'warn'` — they never block `kerith check`'s exit code without `--strict`.

---

## Runtime Zero & bootstrap cache

Kerith charges the cost of architecture exactly once — during bootstrap. After `createApp()` returns, the framework is gone: no DI container alive in memory, no proxies, no interceptors on any request path.

|            | Bootstrap                      | Per request                  |
| ---------- | ------------------------------ | ---------------------------- |
| **Kerith** | Scales with module/route count | Pure Express — zero overhead |

| Factor                       | Affects bootstrap | Affects request latency |
| ---------------------------- | ----------------- | ----------------------- |
| Number of modules            | ✅ Yes            | ❌ No                   |
| Number of routes per module  | ✅ Yes (mounting) | ❌ No                   |
| Complexity of business logic | ❌ No             | ✅ Yes                  |
| Request concurrency          | ❌ No             | ✅ Yes                  |

### Bootstrap cache

In development, Kerith writes a bootstrap cache to `.kerith/bootstrap-cache.json`. On restarts, only modules whose files changed on disk are re-scanned; unchanged ones are hydrated from cache:

```
Bootstrap complete from cache — 12ms (0 modules rescanned)
Bootstrap complete from cache — 34ms (1 modules rescanned)
```

The cache is invalidated automatically when `kerith.config.ts` changes. Use `kerith dev --force` (forces cache invalidation before starting) or `kerith clean --cache` (deletes the cache file) to force a full re-scan. **Never active in production** (`NODE_ENV=production`) — production always does a full scan.

> **Note:** En modo flat (sin dominios), cualquier cambio en cualquier módulo invalida el cache del proyecto completo. Para invalidación incremental real, usar dominios.

Kerith also (re)generates `tsconfig.kerith.json` on every bootstrap for IDE support, and ensures your root `tsconfig.json` extends it.

---

## API reference

### `createApp(app?, options?)`

```ts
function createApp(
  app?: Application,
  options?: CreateAppOptions,
): Promise<KerithApp>;
```

Bootstraps the application through a deterministic 10-step pipeline: guard checks → config load → setup/pre-validation → cache decision & scan → entity registration → NITS reconciliation → alias activation → dynamic imports → dependency validation → controller discovery & mounting (skipped without `app`) → cache write. Throws a `KerithError` before mounting any route if anything is invalid — the app is never left in a partial state.

`app` is **optional** since v2.0.0 — see [worker mode](#quick-start). All declarative configuration lives in `kerith.config.ts`; the only thing that remains a `createApp()` option is `logger`, because it's a runtime function reference that can't be serialized into a config file.

| Option   | Type         | Description                                                                                                   |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `logger` | `LogHandler` | Custom log handler. If omitted, Kerith uses its internal Pino instance configured via `logLevel`/`logFormat`. |

Returns `KerithApp`:

```ts
interface KerithApp {
  modules: RegisteredModule[];
  routes: MountedRoute[];
  registry: KerithRegistry;
  runtime: {
    preloaderActive: boolean; // true when --import ./.kerith/preload.js is active
    preloaderVersion: string | null;
    aliasesAtBoot: Record<string, string>;
  };
  listen(server: http.Server, options?: ListenOptions): ShutdownHook;
}
```

`RegisteredModule`:

```ts
interface RegisteredModule {
  id: string;
  name: string;
  domain?: string;
  path: string; // absolute path to the module directory
  imports: string[];
  exports: string[];
  controllers: string[];
}
```

`MountedRoute`:

```ts
interface MountedRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "USE";
  path: string;
  module: string;
  controller: string;
}
```

### Registry — `getRegistry()`

Returns the read-only, `@unstable`-extended registry bound to the current async execution context. Only callable within a `createApp()` scope (or synchronously during its execution — the context is `AsyncLocalStorage`-scoped and ends once `createApp()` resolves).

```ts
import { getRegistry } from "@kerith/core";

const registry = getRegistry();
registry.hasModule("users");
registry.getModule("payments", "billing"); // domain-aware lookup
registry.getAllModules();
registry.hasDomain("billing");
registry.getAllDomains();
registry.resolveAlias("@modules/users");
registry.getAllAliases();
registry.getRegisteredAliases(); // bare alias keys, no /* wildcards
```

`KerithRegistry` (stable):

```ts
interface KerithRegistry {
  hasModule(name: string, domain?: string): boolean;
  getModule(name: string, domain?: string): RegisteredModule | undefined;
  getAllModules(): RegisteredModule[];
  hasDomain(name: string): boolean;
  getDomain(name: string): DomainRegistration | undefined;
  getAllDomains(): DomainRegistration[];
  resolveAlias(alias: string): string | undefined;
  getAllAliases(): Record<string, string>;
  getRegisteredAliases(): string[];
}
```

`KerithRegistryAdvanced` (returned by `getRegistry()`, `@unstable` — may change between minor versions):

```ts
interface KerithRegistryAdvanced extends KerithRegistry {
  getDependencyGraph(): Map<string, string[]>;
  findCircularDependencies(): string[][];
}
```

Instead accessible directly off the result of `createApp()` is `kerith.registry`, typed as the stable `KerithRegistry`.

### Logging — `useLogger()` / `createLogger()`

```ts
import { useLogger } from "@kerith/core";

const log = useLogger("my-app");
log.info("Connecting to database...");
// Development: 19:15:30.123  [my-app]  INFO  Connecting to database...
// Production:  {"level":"info","time":"...","service":"my-app","msg":"Connecting to database..."}
```

`createLogger(name: string)` is a convenience alias for `useLogger(name)`. `createLogger(handler, minLevel, module?)` is an internal-facing overload for full control (used internally to build the bootstrap logger).

`Logger` interface:

```ts
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(
    message: string,
    meta?: Record<string, unknown> & { err?: Error; error?: Error },
  ): void;
}
```

If `meta.err` or `meta.error` is an `Error` instance, its stack trace is automatically serialized in JSON mode.

**Environment variables:**

| Variable              | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `KERITH_LOG_LEVEL`    | Minimum severity (`debug`, `info`, `warn`, `error`). Takes priority over `logLevel` resolution defaults. |
| `NODE_DEBUG=kerith`   | Forces `debug` level (checked if `KERITH_LOG_LEVEL` is unset).                                           |
| `KERITH_LOG_FORMAT`   | Forces `pretty` or `json`, overriding the `auto` (`NODE_ENV`-based) default.                             |
| `KERITH_PROFILE=true` | Emits `[perf]` debug timing logs for module imports during bootstrap.                                    |

### Custom transports (Loki, Datadog, etc.)

```ts
// kerith.config.ts
import pino from "pino";

const externalPino = pino({
  transport: {
    target: "pino-datadog-transport",
    options: {
      /* ... */
    },
  },
});

export default {
  logger: (level, msg, meta) => externalPino[level](meta || {}, msg),
};
```

Kerith **does not** intercept `console.log` calls from your application code — those are your own responsibility and print without the framework's structured format.

---

## HTTP request logging

_(New — not tied to a specific documented version tag in source, part of the current `v2.0.0` public surface.)_

`useHttpLogger()` returns opt-in Express middlewares that share the same Pino instance as the rest of the app:

```ts
import { useHttpLogger } from "@kerith/core";

const httpLogger = useHttpLogger({ ignore: ["/health*"], requestId: true });

app.use(httpLogger.requests()); // mount early in the pipeline
// ... your routes and createApp() here ...
app.use(httpLogger.errors()); // mount at the very end
```

`requests()` logs `METHOD /path STATUS` with response time on `res.on('finish')`; level auto-escalates to `warn` for 4xx and `error` for 5xx. `errors()` is a 4-argument Express error handler: it always logs the real error internally, and — in production, unless `sanitizeErrors: false` — returns a generic `"Internal server error"` message to the client while the real one stays in your logs.

| Option           | Type              | Default                     | Description                                                                                                                                                                 |
| ---------------- | ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ignore`         | `string[]`        | `[]`                        | Routes to skip. Exact strings or simple globs (`'/health*'` crosses slashes; a `*` mid-pattern matches one path segment only).                                              |
| `logBody`        | `boolean`         | `false`                     | Include the request body — only actually printed when the logger's level is `debug`.                                                                                        |
| `sanitizeErrors` | `boolean`         | `true`                      | In production, replaces the client-facing error message with a generic one. The real message is always logged internally.                                                   |
| `requestId`      | `boolean`         | `false`                     | Generates (or extracts) a request ID into `res.locals.requestId`, generated _before_ the ignore check so it's usable in your own middlewares regardless of log suppression. |
| `getRequestId`   | `(req) => string` | `() => crypto.randomUUID()` | Custom ID source, e.g. reading an upstream gateway header.                                                                                                                  |

---

## Graceful shutdown

`kerith.listen(server, options?)` — call it once after `app.listen()` (or with any `http.Server`, independent of whether an Express `app` was passed to `createApp()`):

```ts
const server = app.listen(3000);
kerith.listen(server, {
  onShutdown: async () => {
    await db.disconnect();
    await redis.quit();
  },
});
```

Sequence on `SIGINT` / `SIGTERM` (also triggerable via IPC message `'kerith:shutdown'`, used by `kerith dev`'s watcher on Windows):

1. `server.close()` — no new connections accepted, existing ones drain naturally.
2. Your `onShutdown()` hook runs, if provided (errors inside it are logged, not thrown).
3. `process.exit(0)`.

A double-invocation guard makes calling `shutdown()` twice — or receiving both signals at once — safe. `kerith.listen()` returns a `ShutdownHook`: a callable `shutdown()` function that also exposes `.unregister()` to remove the signal listeners (useful for tests or hot-reload scenarios).

```ts
const shutdown = kerith.listen(server);
await shutdown(); // trigger manually
shutdown.unregister(); // remove SIGINT/SIGTERM/IPC listeners
```

---

## Error handling

All Kerith errors are instances of `KerithError` with a machine-readable `code`:

```ts
import { KerithError } from "@kerith/core";

try {
  await createApp(app);
} catch (err) {
  if (err instanceof KerithError) {
    console.error(err.code); // e.g. 'EXPORT_MISMATCH'
    console.error(err.message); // human-readable description
    console.error(err.details); // additional context (path, module name, etc.)
  }
  process.exit(1);
}
```

### Codes thrown by `createApp()` / identifiers / config load

| Code                                                              | When it's thrown                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `INVALID_ESM_ENV`                                                 | Project's root `package.json` is missing `"type": "module"`.                                                                   |
| `DUPLICATE_BOOTSTRAP`                                             | The same Express `app` instance is passed to `createApp()` more than once.                                                     |
| `ORIGIN_NOT_FOUND`                                                | Configured `origin` directory does not exist.                                                                                  |
| `PRELOADER_REQUIRED`                                              | `requirePreloader: true` and the process wasn't started with `--import ./.kerith/preload.js`.                                  |
| `ALIAS_RESERVED`                                                  | An alias key in `kerith.config.ts` is `@modules`, `@shared`, or `@`.                                                           |
| `INVALID_ALIAS_KEY`                                               | An alias key doesn't match `/^@[a-zA-Z][a-zA-Z0-9-]*$/`.                                                                       |
| `MODULE_NOT_FOUND`                                                | A module directory has no `index.ts`/`index.js`, or (flat mode) the index doesn't call `Module()`.                             |
| `INVALID_MODULE_DECLARATION`                                      | `Module()` name doesn't match its folder, or was called outside a valid index file / async context.                            |
| `INVALID_DOMAIN_DECLARATION`                                      | Same rule as above, for `Domain()`.                                                                                            |
| `INVALID_SUBMODULE_DECLARATION`                                   | Same rule as above, for `SubModule()`.                                                                                         |
| `PARENT_MODULE_NOT_FOUND`                                         | `SubModule()` has no registered ancestor module.                                                                               |
| `SUBMODULE_NESTED`                                                | A `SubModule()` is declared inside another `SubModule()`'s folder.                                                             |
| `DUPLICATE_MODULE` / `DUPLICATE_DOMAIN` / `DUPLICATE_SUBMODULE`   | Two identifiers of the same kind register the same name/NITS ID/folder.                                                        |
| `DUPLICATE_SERVICE` / `DUPLICATE_REPOSITORY` / `DUPLICATE_SCHEMA` | Two `Service()`/`Repository()`/`Schema()` calls share the same name.                                                           |
| `MODULE_SPACE_CONFLICT`                                           | A module name exists in both flat space and domain space simultaneously.                                                       |
| `MISSING_IMPORT`                                                  | A module in `imports[]` doesn't exist in the registry (strict only).                                                           |
| `UNDECLARED_IMPORT`                                               | A file imports a module not listed in its `Module()` `imports[]` (strict only).                                                |
| `UNUSED_IMPORT`                                                   | A module declares an import in `imports[]` it never actually uses (strict only).                                               |
| `CIRCULAR_DEPENDENCY`                                             | A dependency cycle was detected (strict only).                                                                                 |
| `SHARED_IN_IMPORTS`                                               | A module name is in `shared[]`, or a `@shared` alias is in `imports[]` (strict throws, non-strict warns).                      |
| `UNDECLARED_SHARED`                                               | `shared[]` contains something other than `'@shared'`/subpath, or `@shared` isn't registered (strict throws, non-strict warns). |
| `EXPORT_MISMATCH`                                                 | A name in `exports[]` isn't a real export of the module's `index.ts`.                                                          |
| `INVALID_CONTROLLER`                                              | A controller file failed to import, or has no `default export` of an Express `Router`.                                         |
| `MODULE_LOAD_TIMEOUT`                                             | A dynamic import of a module, domain, submodule, or controller exceeded `rules.moduleLoadTimeout`.                             |
| `REGISTRY_MISSING_CONTEXT`                                        | A Kerith identifier/registry API was called outside a `createApp()` async execution scope.                                     |
| `CLI_ERROR`                                                       | A `kerith` CLI command failed with a validation error (invalid name, existing directory, etc.).                                |

### Warning-only / observability codes (never thrown)

| Code                         | Meaning                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `PRELOADER_VERSION_MISMATCH` | `.kerith/preload.js` was generated by a different `@kerith/core` version. Logged as `warn`. |
| `NITS_DELETE_CONFIRMED`      | Structured log emitted when NITS confirms a stale module was genuinely deleted.             |

### Reserved codes present in the type union but not currently thrown anywhere in `src/`

These exist in `KerithErrorCode` for forward-compatibility, but no current code path constructs a `KerithError` with them: `ALIAS_NOT_FOUND`, `ALIAS_INVALID`, `ALIAS_CONFLICT`, `DUPLICATE_ALIAS`, `UNUSED_SHARED`, `SHARED_SCOPE_VIOLATION`, `MODULE_IN_SHARED`. Of these, `UNUSED_SHARED` and `SHARED_SCOPE_VIOLATION` **are** implemented — just as `kerith check` violation types, not as bootstrap-time exceptions. `RELATIVE_BOUNDARY_VIOLATION` and the other `kerith check`-only violation types are also part of `KerithErrorCode` but are only ever surfaced through the CLI report, not thrown by `createApp()`.

---

## CLI reference

All commands are available via the `kerith` binary (installed with the package) or `npx kerith <command>`.

### `kerith generate <schematic> <name>` (alias `kerith g`)

This is the primary and recommended way to scaffold Kerith artifacts. It provides a familiar CLI experience for developers coming from Angular CLI or NestJS.

**Available Schematics:**

- `module` (alias `mo`)
- `domain` (alias `d`)
- `submodule` (alias `sub`)
- `shared`

**Examples:**

```bash
npx kerith generate module payments --domain billing --full
npx kerith g mo users --service --routes
npx kerith g domain billing --modules payments,invoices
npx kerith g shared --global
```

#### Common Options:

| Option                                                 | Description                                        | Applies to                      |
| ------------------------------------------------------ | -------------------------------------------------- | ------------------------------- |
| `-p, --path <path>`                                    | Custom destination folder.                         | `module`                        |
| `--domain <name>`                                      | Scaffold inside an existing domain.                | `module`, `submodule`, `shared` |
| `--module <name>`                                      | Parent module (Required for submodule).            | `submodule`                     |
| `--service` / `--routes` / `--repository` / `--schema` | Generate the corresponding file.                   | `module`, `submodule`           |
| `--full`                                               | Generate all of the above.                         | `module`                        |
| `--modules <names...>`                                 | Scaffold modules inside the new domain.            | `domain`                        |
| `--shared`                                             | Also create a `_shared/` folder inside the domain. | `domain`                        |
| `--global`                                             | Create the global `src/shared/` folder.            | `shared`                        |
| `--ts` / `--js`                                        | Force TypeScript/JavaScript output.                | All                             |

### Legacy Commands

> **Warning:** The `create-*` commands are considered legacy. They are still available and function identically, but it is highly recommended to use the `kerith generate` command instead.

#### `kerith create-module <name>`

_Legacy equivalent of `kerith generate module <name>`_

#### `kerith create-domain <name>`

_Legacy equivalent of `kerith generate domain <name>`_

#### `kerith create-submodule <name>`

_Legacy equivalent of `kerith generate submodule <name>`_

#### `kerith create-shared`

_Legacy equivalent of `kerith generate shared`_

### `kerith sync-tsconfig`

Syncs Kerith aliases into `tsconfig.json`'s `paths` array for IDE support, and purges stale entries idempotently.

```bash
npx kerith sync-tsconfig
```

| Option              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `--tsconfig <path>` | Path to `tsconfig.json`. Default: `tsconfig.json`. |
| `--silent`          | Suppress output when already up to date.           |

### `kerith sync-preload`

Generates `.kerith/preload.js`, a static ESM entry that registers the alias hook before your application code runs. **Idempotent** — commit the output file to version control.

```bash
npx kerith sync-preload
```

| Option     | Description                              |
| ---------- | ---------------------------------------- |
| `--silent` | Suppress output when already up to date. |

### `kerith dev <entrypoint>`

Starts the app in development mode. Runs `sync-preload` and `sync-tsconfig` automatically before every start, then injects `--import ./.kerith/preload.js` if present.

```bash
npx kerith dev src/server.ts --watch
```

| Option                  | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `--watch`               | Restart on file changes, via chokidar (does **not** delegate to `node --watch`). |
| `--clear`               | Clear the terminal on start and on every restart.                                |
| `--runtime <node\|tsx>` | Runtime used to run the entrypoint. Default: `node`.                             |
| `--force`               | Force bootstrap-cache invalidation before starting.                              |

### `kerith check`

Static architecture analysis — inspects raw ASTs across the module structure without evaluating your application code. See the [next section](#kerith-check--architecture-violations) for the full violation table.

```bash
npx kerith check --strict --format json
```

| Option                                      | Description                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `--strict`                                  | Exit 1 if **any** violation is found (including `warn`-severity ones).         |
| `--module <name>`                           | Narrow analysis to a specific module.                                          |
| `--level <domain\|module\|submodule\|flat>` | Filter output sections.                                                        |
| `--format <text\|json>`                     | Output format. `json` includes a `coupling` map (`fanOut`/`fanIn` per module). |
| `--no-circular`                             | Disable circular-dependency detection.                                         |
| `--verbose`                                 | Show internal NITS IDs in the output.                                          |

### `kerith clean`

Removes generated Kerith artifacts.

```bash
npx kerith clean --shadow-files   # interactive confirmation, deletes .kerith identity files
npx kerith clean --cache          # deletes .kerith/bootstrap-cache.json
```

| Option           | Description                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--shadow-files` | Delete all `.kerith` module identity files. NITS IDs regenerate on next bootstrap (interactive `y/N` confirmation). |
| `--cache`        | Delete `.kerith/bootstrap-cache.json`.                                                                              |

---

## `kerith check` — architecture violations

`kerith check` detects 18 violation types. Only a handful are hard errors (`severity: 'error'`, always exit 1); the rest are `warn` — exit 0 unless `--strict` is passed.

| Violation                     | Severity | Description                                                                                              |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `relative-boundary-violation` | 🔴 error | A relative import (`../`) escapes the module's own directory.                                            |
| `domain-boundary-violation`   | 🔴 error | A module imports another domain's internal module alias instead of its public `@domain` surface.         |
| `shared-scope-violation`      | 🔴 error | A module from a foreign domain imports `@{domain}/shared`.                                               |
| `undeclared-shared`           | 🟡 warn  | `shared[]` references something invalid, or `@shared` is used but not registered.                        |
| `unused-shared`               | 🟡 warn  | A module declares `shared[]` access it never actually uses.                                              |
| `private-import`              | 🟡 warn  | Importing an internal file of another module directly instead of through its public index.               |
| `undeclared-import`           | 🟡 warn  | A file imports from a module not listed in the consuming module's `imports[]`.                           |
| `circular-dependency`         | 🟡 warn  | A dependency cycle exists between modules.                                                               |
| `module-space-conflict`       | 🟡 warn  | A module name exists in both flat space and domain space.                                                |
| `submodule-direct-sibling`    | 🟡 warn  | A submodule imports a sibling submodule directly instead of through the parent module.                   |
| `submodule-domain-bypass`     | 🟡 warn  | A submodule imports its own domain root directly, bypassing its parent module.                           |
| `fan-out-high`                | 🟡 warn  | A module imports from more distinct modules than `rules.fanOutThreshold`.                                |
| `fan-in-high`                 | 🟡 warn  | A module is consumed by more modules than `rules.fanInThreshold` (`_shared` modules excluded by design). |
| `module-depth-exceeded`       | 🟡 warn  | A module's folder structure exceeds `rules.maxModuleDepth`.                                              |
| `module-too-large`            | 🟡 warn  | A module has more files than `rules.maxModuleFiles`.                                                     |
| `too-many-submodules`         | 🟡 warn  | A module has more SubModules than `rules.maxSubModulesPerModule`.                                        |
| `unused-export`               | 🟡 warn  | A declared export is never imported by any other module.                                                 |
| `empty-module`                | 🟡 warn  | A module has no registered identifiers at all.                                                           |

`kerith check`'s exit-code messaging reflects this directly:

- `exit 0 — no violations found`
- `exit 0 — N warnings (use --strict to block)`
- `exit 1 — violations found` (any hard error, or any violation at all with `--strict`)

Example (illustrative, domain-mode project):

```text
Domains
✔  billing     OK
✗  workspace   1 violation(s)

Modules
✔  billing/payments    OK
✗  workspace/members   1 violation(s)
  ✗ domain-boundary-violation: importing '@billing/payments' directly
    Suggestion: Import from '@billing' instead

Coupling
⚠  payments   fan-out-high — imports from 9 modules (threshold: 5)

Summary: exit 1 — violations found
```

In v1 (flat) projects, output has no Domain sections and looks identical to pre-domain-hierarchy versions.

---

## NITS — module identity tracking

NITS (Native Identity Tracking System) assigns a stable `mod_{hex}` ID to every module, so Kerith can track it across renames, moves, and Git branch switches — preventing identity loss during refactors. State lives in `.kerith/registry.json`, which **should be committed** to version control.

### The Verification Triangle

1. **Match by path** (maximum confidence) — same directory ⇒ same module.
2. **Match by hash** (high confidence, similarity ≥ `nits.similarityThreshold`, default **0.9**) — same `Service`/`Repository`/`Schema` names across locations ⇒ moved module. `Controller` names are intentionally excluded from this hash (route prefixes aren't semantic identity).
3. **Match by name** (medium confidence) — a previously `stale` module found by name at a new location ⇒ `candidate` for confirmation on the _next_ run (a deliberate two-cycle grace period, not a bug).

A module gets permanently purged as deleted after `rules.stalePurgeCycles` (default **5**) consecutive bootstraps without being rediscovered.

### Resolving merge conflicts

1. Accept either side of the Git conflict to make the JSON valid again.
2. Run `npx kerith check`.
3. NITS automatically detects and heals the registry.
4. Commit the updated `.kerith/registry.json`.

---

## TypeScript types

Types are bundled — no `@types/kerith` needed.

```ts
import type {
  // Bootstrap
  CreateAppOptions,
  KerithApp,
  ListenOptions,
  ShutdownHook,
  RegisteredModule,
  MountedRoute,
  // Registry
  KerithRegistry,
  KerithRegistryAdvanced,
  DomainRegistration,
  SubModuleRegistration,
  ModuleRegistration,
  // Identifiers
  ModuleOptions,
  DomainOptions,
  SubModuleOptions,
  HierarchyLevel,
  ControllerOptions,
  ServiceOptions,
  RepositoryOptions,
  SchemaOptions,
  // Config
  KerithConfig,
  NitsConfig,
  GetAliasesOptions,
  // Logging
  LogLevel,
  LogHandler,
  Logger,
  LogFormat,
  HttpLogger,
  HttpLoggerOptions,
  // Errors
  KerithErrorCode,
  // Misc
  WatcherOptions,
  PreloadConfig,
} from "@kerith/core";

// Pre-loader runtime helpers
import { isPreloaderActive, getPreloadConfig } from "@kerith/core";
```

---

## Requirements

|            | Minimum                              |
| ---------- | ------------------------------------ |
| Node.js    | 20.6.0                               |
| Express    | 5.x (peer, optional for worker mode) |
| TypeScript | 5.0+ (optional)                      |

Kerith is a pure ESM package — no CommonJS support, no `require()`. Requires `"type": "module"` in `package.json`.

---

## License

MIT

Developed and maintained by **Vlynk Studios**.
