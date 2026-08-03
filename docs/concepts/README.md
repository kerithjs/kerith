# Kerith core concepts

This document is the **single source of truth** for the four concepts that cut across the entire ecosystem: the `Domain → Module → SubModule` hierarchy, **Shared** resources, **NITS** (module identity) and the **Channels** of the Extension API.

Package READMEs (`@kerith/core`, `@kerith/app`, `@kerith/identifiers`) do not repeat these explanations — they link here instead. If you're documenting a package and need to explain one of these four concepts, link to the relevant section below rather than rewriting it.

## Table of contents

1. [The `Domain → Module → SubModule` hierarchy](#1-the-domain--module--submodule-hierarchy)
2. [Shared — shared resources](#2-shared--shared-resources)
3. [NITS — identity tracking](#3-nits--identity-tracking)
4. [Channels — the Extension API](#4-channels--the-extension-api)

---

## 1. The `Domain → Module → SubModule` hierarchy

Kerith infers a project's architecture directly from the filesystem. There is no declarative structure configuration: each level is declared by calling an identifier (`Domain()`, `Module()`, `SubModule()`) from its own folder's `index.ts`, and that identifier's name **must** match the name of the folder containing it.

All three identifiers live in `@kerith/core` (`Domain()` and `SubModule()` under `core/identifiers/`; `Module()` also has a real implementation there, re-exported from the top-level barrel alongside `Controller()`, `Service()`, `Repository()`, and `Schema()`). They are plain function calls, not decorators: they execute once when their file is imported and write into an `AsyncLocalStorage`-scoped registry that only exists during a `createApp()` execution. Calling any identifier outside that context throws `REGISTRY_MISSING_CONTEXT`.

### `Domain(name, options?)`

A domain is a **pure filesystem grouping** — not a dependency unit. It accepts no `imports`/`exports`, only `description` (documentation only, no runtime effect).

```ts
// src/billing/index.ts
Domain("billing", { description: "Billing and payments domain" });
```

### `Module(name, options?)`

The module is the system's **real dependency unit**. It explicitly declares what it imports, what it exports, and which shared resources it accesses:

```ts
// src/billing/payments/index.ts
Module("payments", {
  imports: ["invoices"], // other modules this one depends on (same domain)
  exports: ["PaymentService"], // public API — validated against real index.ts exports
  shared: ["@shared"], // access to global shared resources (see section 2)
});
```

The domain a module belongs to is **always inferred from its filesystem location** — never passed as an option. A module can stand alone (flat mode, no domain) or live inside a domain; both are valid and coexist in the same project.

### `SubModule(name, options?)`

A submodule is a **scoped implementation detail**, nested at `<module>/submodules/<name>/`. It accepts no `imports`/`exports` — it is not an independently addressable dependency unit, only an internal subdivision of its parent module:

```ts
// src/billing/payments/submodules/trial/index.ts
SubModule("trial", { description: "Free-trial billing logic" });
```

The parent module and domain are inferred automatically from the path. If no registered module exists as an ancestor, `PARENT_MODULE_NOT_FOUND` is thrown. Nesting a `SubModule` inside another `SubModule` throws `SUBMODULE_NESTED`.

### Automatically generated aliases

Every discovered level gets import aliases with no manual configuration:

| Alias                          | Points to                             | When it exists                                 |
| ------------------------------ | ------------------------------------- | ---------------------------------------------- |
| `@modules/<name>`              | The module's `index.ts`               | Every discovered module, flat or domain-scoped |
| `@<domain>`                    | The domain folder                     | Every discovered domain                        |
| `@<domain>/<module>`           | The module's `index.ts`               | Modules that live inside a domain              |
| `@shared` / `@<domain>/shared` | Global / domain-scoped shared folders | See section 2                                  |

### Boundary rules

`@` always crosses into another module. `./` and `../` always stay within the current module:

```ts
import { X } from "./local-file"; // ✅ internal to the module
import { X } from "@modules/payments"; // ✅ declared cross-module connection
import { X } from "../payments/service"; // ❌ RELATIVE_BOUNDARY_VIOLATION
```

A relative path that escapes the module directory is **always** a hard error in `kerith check` (exit 1, regardless of `--strict`). In domain mode, reaching directly into another domain's internal module is a domain boundary violation (also a hard error):

```ts
import { X } from "@billing/payments"; // ❌ from outside 'billing' — DOMAIN_BOUNDARY_VIOLATION
import { X } from "@billing"; // ✅ the domain's public surface is always importable
```

Submodules have their own rules on top of that: they must reach their siblings (other submodules of the same module) only through the parent module (`submodule-direct-sibling` otherwise), and must never import their own domain root directly, bypassing the parent (`submodule-domain-bypass`).

---

## 2. Shared — shared resources

Kerith provides two levels of shared code, both bootstrap-validated.

| Type          | Alias              | Who can access              | How to declare                                |
| ------------- | ------------------ | --------------------------- | --------------------------------------------- |
| Global        | `@shared`          | Any module, any domain      | Explicit: `shared: ['@shared']` in `Module()` |
| Domain-scoped | `@{domain}/shared` | Only modules in that domain | Implicit — no declaration needed              |

**Global shared** lives in `src/shared/`. A module must declare explicit intent to use it:

```ts
Module("payments", { shared: ["@shared"] });
```

```bash
kerith create-shared --global   # → creates src/shared/index.ts
```

**Domain-scoped shared** lives in `src/{domain}/_shared/`. Any module within that domain can import from it with no declaration needed:

```ts
// src/billing/payments/payments.service.ts
import { db } from "@billing/shared/db"; // implicit — same domain
```

```bash
kerith create-shared --domain billing   # → creates src/billing/_shared/index.ts
kerith create-domain billing --shared   # → creates domain + _shared in one step
```

### Best practices

1. **Type-only barrels**: the `index.ts` of any `_shared`/`shared` directory should be used **strictly** as a type barrel (`export type { ... }`). Never re-export runtime logic or values from it.
2. **Direct imports**: functions, constants, and classes should be imported **directly by their subpath** (`import { currency } from '@shop/shared/utils/currency.js'`), thanks to Kerith's `preload-hook.ts`.
3. **Why**: `export type` is erased during compilation (zero cost, zero risk of cycles). A runtime barrel evaluates all its top-level exports as soon as any single item is imported, which easily introduces circular dependencies.
4. **`verbatimModuleSyntax: true`** in `tsconfig.json` (enabled by default in projects scaffolded with `kerith init`/`create-kerith`) enforces explicit `import type`/`export type` usage.

### Validation

Enforced at bootstrap (severity differs between `strict` and non-`strict` mode):

| Rule                                                                              | Behavior                                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A module name (not `@shared`/subpath) is placed in `shared[]`                     | Should be in `imports[]` instead. `SHARED_IN_IMPORTS` (throws in strict, warns otherwise) |
| A `@shared`-family alias is placed in `imports[]`                                 | Should be in `shared[]` instead. Same code.                                               |
| `shared[]` contains something that isn't `'@shared'` or a `'@shared/...'` subpath | `UNDECLARED_SHARED` (throws in strict, warns otherwise)                                   |
| `shared: ['@shared']` is declared but no global `src/shared/` folder exists       | `UNDECLARED_SHARED` (throws in strict, warns otherwise)                                   |

`UNUSED_SHARED` (declared but never actually imported) and `SHARED_SCOPE_VIOLATION` (a module from a foreign domain imports `@{domain}/shared`) are **not** thrown at bootstrap — they're detected exclusively by `kerith check` (`SHARED_SCOPE_VIOLATION` is a hard error, always exit 1 even without `--strict`; `UNUSED_SHARED` is a warning). `@kerith/eslint-plugin` mirrors the same rules at edit time via `no-undeclared-shared` and `no-shared-scope-violation`.

---

## 3. NITS — identity tracking

NITS (Native Identity Tracking System) assigns a stable ID to every domain and module so Kerith can track it across renames, moves, and Git branch switches, without losing identity during refactors.

- Modules get `mod_{hex}` IDs.
- Domains get `dom_{hex}` IDs (format `dom_[0-9a-f]{8}`).

### Where the state lives

There are **two distinct registries**, not one:

- `.kerith/registry.json` at the project root — the global/flat module registry.
- `<domain>/.kerith-register/registry.json` — one registry **per domain**, nested inside the domain's own folder. Each domain owns its own identity file; there is no centralized domain registry.

Both **should be committed** to version control — this is how Kerith preserves identity across bootstraps and across developers.

### The Verification Triangle

Identity reconciliation on every bootstrap, in order of confidence:

1. **Match by path** (maximum confidence) — same directory ⇒ same module.
2. **Match by hash** (high confidence, similarity ≥ `nits.similarityThreshold`, default **0.9**, Jaccard) — same `Service`/`Repository`/`Schema` names found at a different location ⇒ moved module. `Controller` names are intentionally excluded from this hash (route prefixes aren't semantic identity).
3. **Match by name** (medium confidence) — a previously `stale` module found by name at a new location becomes a `candidate`, and is only confirmed on the **next** bootstrap — a deliberate two-cycle grace period, not a bug.

A module is permanently purged as deleted after `rules.stalePurgeCycles` (default **5**) consecutive bootstraps without being rediscovered (emits the structured `NITS_DELETE_CONFIRMED` log).

### Resolving merge conflicts

1. Accept either side of the Git conflict to make the JSON valid again.
2. Run `npx kerith check`.
3. NITS automatically detects and heals the registry.
4. Commit the updated `registry.json` (global or domain-scoped, as applicable).

---

## 4. Channels — the Extension API

Channels are the universal communication protocol between `@kerith/core`, `@kerith/identifiers`, and `@kerith/app`. There are **four**: Alias, Middleware, Schedule, and Binding. Every identifier in the `@kerith/identifiers` catalog belongs to exactly one of them (or is purely `structural`, with no channel — see the category table in the `@kerith/identifiers` README).

### How the pieces fit together

- **`@kerith/core`** exposes the generic, agnostic mechanism: a singleton store (`core/extension`) with four provider arrays (`AliasProvider[]`, `MiddlewareResolver[]`, `ScheduleProvider[]`, `BindingProvider[]`) plus identifier metadata, and the `register*`/`getRegistered*` functions to write and read them. Core validates name, duplicates (within a file or across files), and shape — it **never** interprets what any given provider does. This is intentional: it keeps Core agnostic of any concrete implementation (see `core`'s `ARCHITECTURE_DECISIONS.md`).
- **`@kerith/identifiers`** defines the concrete identifier catalog (`Client`, `Guard`, `Cron`, `Worker`, etc.) and, when called, registers its corresponding provider against Core's store.
- **`@kerith/app`** is the one that **executes** each channel — it provides the concrete executors (`alias-channel-executor.ts`, `middleware-channel-executor.ts`, `cron-executor.ts`, `worker-executor.ts`, `message-executor.ts`, `stream-executor.ts`, `gateway-executor.ts`) and the real adapters (Express, BullMQ, node-cron, Socket.io, ioredis).

This subpath (`@kerith/core/extension`) is **internal API**, meant exclusively to be consumed by `@kerith/app` — it is not public surface for end developers.

### The four channels

#### Alias

Defines import aliases resolvable at runtime. Identifiers: `Client`, `Config`, `Provider`, `Store`, `Vault`, `Publisher`, `Tracer`, `Adapter`.

```ts
interface AliasProvider {
  prefix: string;
  name: string;
  filePath: string;
  resolve: () => unknown;
}
```

> `resolve()` is reserved for a future dependency injection container — it is not invoked anywhere in `@kerith/core` or `@kerith/app` in v2.0.0-alpha.1. Current alias resolution works via `filePath` + the ESM alias hook, without calling `resolve()`.

#### Middleware

Registers request/response processing middleware. Identifiers: `Guard`, `RateLimit`, `Firewall`, `Middleware`, `Interceptor`, `Pipe`, `Filter`, `Webhook`.

```ts
interface MiddlewareResolver {
  name: string;
  filePath: string;
  phase: "pre" | "post" | "error";
  priority: number;
  getHandlers(controller: ControllerEntry): unknown[];
}
```

#### Schedule

Registers scheduled tasks. Identifiers: `Cron`, `Daemon`, `HealthCheck`, `Probe`.

```ts
interface ScheduleProvider {
  name: string;
  filePath: string;
  timing: "after-bootstrap" | "on-listen" | "on-shutdown";
  execute(): Promise<void> | void;
}
```

**Fail-soft by design**: if a Schedule provider throws at any of its three execution points, it is logged with the schedule's name and execution continues with the next provider. A broken `Cron()` or `Daemon()` does not crash the whole application or block other schedules — it is treated as a user extension error (`[app]` tier).

#### Binding

Registers background job processors and event handlers. Identifiers: `Gateway`, `Worker`, `Processor`, `Batch`, `Message`, `Subscriber`, `Saga`, `Choreography`, `SSE`, `Stream`, `Metric`.

```ts
interface BindingProvider {
  name: string;
  filePath: string;
  kind: string;
  bind(): Promise<void> | void;
}
```

**Fail-fast by design** — the opposite of Schedule: if a `Worker().bind()` (or any other Binding identifier) fails, bootstrap aborts with `BINDING_EXECUTION_FAILED`, including the provider's name. This prevents running with critical integrations (queues, databases) in a broken state.

> **Important restriction**: a Binding cannot depend on an alias registered via `Client()`/`Store()`/etc., because Binding executes before Alias Providers are activated. If you need aliases inside binding logic, use direct file imports instead.

### Execution order within bootstrap

Channels don't run in a dedicated Core step — `@kerith/app` wraps Core's `createApp()` and injects its own hook into the `_onDynamicImportsComplete` callback, which Core invokes at the end of Step 06 (Dynamic Imports), before Step 07 (dependency validation) and Step 08 (controller mounting). Inside that hook, the order is: Alias → Middleware → Schedule passthrough → Cron → Worker → Message → Stream → Gateway.

`Gateway()` (Socket.io) is a special case within Binding: it is registered at bootstrap like any other Binding provider, but only establishes the actual WebSocket connection when `kerithApp.listen(server)` is called — the point in the lifecycle where the real HTTP server that Socket.io needs to attach to actually exists.

### Extension API error codes

| Code                              | When it's thrown                                                |
| --------------------------------- | --------------------------------------------------------------- |
| `INVALID_IDENTIFIER_NAME`         | Identifier name has an invalid format (`/` or whitespace)       |
| `DUPLICATE_ALIAS_IDENTIFIER`      | Duplicate alias identifier within the same file                 |
| `DUPLICATE_MIDDLEWARE_IDENTIFIER` | Duplicate middleware identifier within the same file            |
| `DUPLICATE_SCHEDULE_IDENTIFIER`   | Duplicate schedule identifier within the same file              |
| `DUPLICATE_BINDING_IDENTIFIER`    | Duplicate binding identifier within the same file               |
| `DUPLICATE_EXTENSION_PROVIDER`    | Same provider name registered from different files              |
| `BINDING_EXECUTION_FAILED`        | A Binding provider failed in `bind()` (fail-fast)               |
| `MIDDLEWARE_RESOLUTION_FAILED`    | A Middleware resolver failed in `getHandlers()` (fail-fast)     |
| `MISSING_PEER_DEPENDENCY`         | A required peer dependency is missing (BullMQ, socket.io, etc.) |
| `INVALID_CRON_EXPRESSION`         | Invalid cron expression syntax in `Cron()`                      |
