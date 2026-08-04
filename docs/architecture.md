# Kerith ecosystem architecture

This document gives architectural context for **the whole ecosystem** — `@kerith/core`, `@kerith/app`, `@kerith/identifiers`, and `create-kerith` — as a system. It does not repeat each package's API reference (see each package's README for that) or the explanations of Domain/Module/SubModule, Shared, NITS, or Channels (see [`docs/concepts/`](./concepts/README.md) for those). This document explains **how the pieces fit together**: who depends on whom, how bootstrap flows across packages, and why the ecosystem is split this way.

## Table of contents

1. [Ecosystem map](#1-ecosystem-map)
2. [Package dependency graph](#2-package-dependency-graph)
3. [The bootstrap pipeline, end to end](#3-the-bootstrap-pipeline-end-to-end)
4. [The Extension API as an extension architecture](#4-the-extension-api-as-an-extension-architecture)
5. [Runtime Zero and the cost model](#5-runtime-zero-and-the-cost-model)
6. [The two error tiers: `[system]` vs `[app]`](#6-the-two-error-tiers-system-vs-app)
7. [`create-kerith`: how it scaffolds a new project](#7-create-kerith-how-it-scaffolds-a-new-project)
8. [Versioning and publication status](#8-versioning-and-publication-status)
9. [Where to look for what](#9-where-to-look-for-what)

---

## 1. Ecosystem map

| Package                 | Role                                                                                               | Publication status       |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| `@kerith/core`          | The engine: deterministic bootstrap, module discovery, NITS identity, HTTP logging, CLI            | Published (`@alpha`)     |
| `@kerith/eslint-plugin` | Architectural rules enforced at edit time — a companion, not a dependency of core                  | Published (`@alpha`)     |
| `@kerith/app`           | Application layer — executes the Channels (Alias, Middleware, Schedule, Binding) on top of Express | Not yet published to npm |
| `@kerith/identifiers`   | Identifier catalog consumed by `@kerith/app`'s Channels                                            | Not yet published to npm |
| `create-kerith`         | Scaffolder — generates a new project from the `core` or `app` template                             | Not yet published to npm |

While `@kerith/app` and `@kerith/identifiers` aren't published, they're used through `create-kerith`'s `app` template inside this monorepo (npm workspaces resolve them locally), or as a `file:`/`workspace:` dependency.

---

## 2. Package dependency graph

The ecosystem's structural rule is **a single direction of dependency, no exceptions**:

```
@kerith/identifiers  ──depends on──▶  @kerith/core
@kerith/app           ──depends on──▶  @kerith/core, @kerith/identifiers
create-kerith         ──depends on──▶  @kerith/core, @kerith/app, @kerith/identifiers
@kerith/eslint-plugin  (independent companion — not a dependency of core, nor depended on by it)
```

No package "below" ever knows about the ones above it: **`@kerith/core` never depends on `@kerith/identifiers` or `@kerith/app`**, and **`@kerith/identifiers` never depends on `@kerith/app`**. This isn't just a packaging convention — it's a hard architectural requirement: any new capability added to Core must not block if `app`/`identifiers` aren't present. The general rule for deciding where to implement something new is: **try it in its own package first (`app` or `identifiers`)**, and only push it up to `core` if that isn't possible — following the same agnostic principle that already governs the Extension API (see section 4).

`create-kerith` is also unknown to any of the three packages it consumes — it is intentionally the graph's only "top" node.

---

## 3. The bootstrap pipeline, end to end

`@kerith/core`'s `createApp()` runs a deterministic 11-step pipeline (`Step 00` through `Step 09`, with an intermediate `Step 01b`). If anything is invalid, it throws a `KerithError` **before** mounting any route — the app is never left in a partial state.

| Step | Name                                                             |
| ---- | ---------------------------------------------------------------- |
| 00   | Bootstrap precondition guards (duplicate check + ESM validation) |
| 01   | Configuration load                                               |
| 01b  | Setup and pre-validation                                         |
| 02   | Cache decision & scanner                                         |
| 03   | Entity registration & file prefetch                              |
| 04   | NITS identity reconciliation                                     |
| 05   | Runtime alias activation (domains, modules, shared)              |
| 06   | Dynamic imports                                                  |
| 07   | Dependency validation (strict mode only)                         |
| 08   | Controller discovery and route mounting (Express only)           |
| 09   | Bootstrap cache write                                            |

`app` is an **optional** argument to `createApp()`: without it, the full pipeline still runs (config, discovery, aliases, NITS, dependency validation) — Step 08 simply becomes a no-op. This is what enables **worker mode**: background processes, queue consumers, or scheduled jobs that still want module boundaries, aliases, and graceful shutdown without HTTP.

### Future consideration: worker_threads

As of v2.0.0, `@kerith/core` does not use Node.js `worker_threads`. If worker threads are introduced in the future, note that **synchronous ESM hooks registered via `registerHooks()` are not automatically inherited by worker threads**. Each worker would need to re-register the hooks independently (e.g., by loading the generated `preload.js` via `--import` in the worker's entry point) to maintain alias resolution consistency across threads.

### Where `@kerith/app` fits in

`@kerith/app` doesn't replace this pipeline or add its own numbered steps — it **wraps** it. Its `createApp()` calls Core's `createApp()`, injecting its own hook into the internal `_onDynamicImportsComplete` option. Core invokes that hook at the **end of Step 06** (dynamic imports), before Step 07 (validation) and Step 08 (controller mounting) — the only point in the lifecycle where every identifier in the project (including those from `@kerith/identifiers`, already declared via its dynamic imports) is registered, but routes haven't been mounted yet.

That hook is where the executors for the four Channels run, in order: Alias → Middleware → Schedule passthrough → Cron → Worker → Message → Stream → Gateway. After Core finishes resolving the `KerithApp`, `@kerith/app` also wraps `kerithApp.listen()` to attach Socket.io to the real HTTP server if any `Gateway()` is declared — the only point in the lifecycle where that server actually exists.

In other words: **Core defines the deterministic skeleton and the extension point; `@kerith/app` decides what to do with that extension point.** Core has no notion of what a "Channel" is — it only exposes a generic hook and an agnostic provider store (section 4).

---

## 4. The Extension API as an extension architecture

See [`docs/concepts/README.md#4-channels--the-extension-api`](./concepts/README.md#4-channels--the-extension-api) for the full detail on the four Channels, their provider interfaces, and their fail-soft/fail-fast rules.

At the ecosystem-architecture level, what matters is the separation of responsibilities:

- **Core** exposes `core/extension` — an agnostic, in-memory singleton store with the `register*`/`getRegistered*` functions for the four provider types (`AliasProvider`, `MiddlewareResolver`, `ScheduleProvider`, `BindingProvider`) plus identifier metadata. It validates shape and duplicates; it never interprets semantics.
- **`@kerith/identifiers`** is the one that **calls** those registration functions when its identifiers execute (`Client()`, `Guard()`, `Cron()`, `Worker()`, etc.), using Core's `getFileCallerInfo` to capture the file path of whatever declares each one.
- **`@kerith/app`** is the one that **reads** that store (via `getRegistered*`) and actually executes each provider through its executors and adapters (Express, BullMQ, node-cron, Socket.io, ioredis).

This subpath (`@kerith/core/extension`) is internal API: it is designed exclusively for `@kerith/app` to consume, and is not public surface for developers building a Kerith project.

---

## 5. Runtime Zero and the cost model

Kerith charges the cost of architecture exactly **once**, during bootstrap. After `createApp()` returns, the framework is gone: no DI container alive in memory, no proxies, no interceptors on any request path.

| Factor                       | Affects bootstrap | Affects request latency |
| ---------------------------- | :---------------: | :---------------------: |
| Number of modules            |        ✅         |           ❌            |
| Number of routes per module  |   ✅ (mounting)   |           ❌            |
| Complexity of business logic |        ❌         |           ✅            |
| Request concurrency          |        ❌         |           ✅            |

In development, Core writes a bootstrap cache (`.kerith/bootstrap-cache.json`): on restarts, only modules whose files changed on disk are re-scanned, the rest are hydrated from cache. The cache is never active in production (`NODE_ENV=production`) — production always does a full scan. In flat mode (no domains), any change invalidates the entire project's cache; real incremental invalidation requires domains.

This cost model holds equally for worker mode (no Express) and for projects using the full `@kerith/app` layer — Channels resolve within the same single bootstrap, they don't add a separate cost cycle on each request.

---

## 6. The two error tiers: `[system]` vs `[app]`

The ecosystem classifies every error and log into two tiers, and this classification is transversal across all four packages:

- **`[system]`** — errors about what Kerith itself offers: a malformed alias, a structural pipeline issue, a duplicate Extension API provider. This is the framework's own responsibility.
- **`[app]`** — errors at the level of the user's project/code: a runtime instance failing inside a `Worker().bind()`, a broken `Cron()`, an invalid schema. This is the programmer's responsibility, not Kerith's.

This distinction is the reasoning behind concrete decisions already made in the Extension API: Binding is fail-fast (`BINDING_EXECUTION_FAILED` aborts bootstrap) because a broken critical-infrastructure provider (queues, DB) shouldn't leave the app running in an inconsistent state; Schedule is fail-soft (logs and continues) because a single broken `Cron()` is an isolated user code error, not a structural failure. Kerith's own identifiers (`Client()`, `Config()`, etc.) validate only route, alias, name, and options when registering something — never the content/instance passed inside. That content is plain user code and falls outside Kerith's cycle after bootstrap, into Node's and the programmer's domain.

---

## 7. `create-kerith`: how it scaffolds a new project

`create-kerith` is deliberately thin — it is not a second, independent generator, it's a **patch on top of Core's output**:

1. Validates CLI flags eagerly, before any prompt.
2. Asks (or reads from flags) the project's decisions: name, template (`core` | `app`), language, port, prefix, output directory.
3. Delegates skeleton generation to `generateProjectStructure` from `@kerith/core/cli` — the `core-template.ts` generator is a single call, with no generation logic or template-string literals of its own: if something's missing from the output, the fix goes in `@kerith/core/cli`, not in `create-kerith`.
4. If the template is `app`, `app-template.ts` **patches** the already-generated file map (adds `@kerith/app` + `@kerith/identifiers` to `package.json`, injects the selected channel stubs) — it never runs a second, independent generator.
5. Writes the files to disk and optionally runs `npm install`.
6. Runs `kerith sync-preload` (+ `sync-tsconfig` for TypeScript) inside the newly created project.

This preserves the same dependency-direction rule from section 2: `create-kerith` knows about `core` and `app`, but neither of them knows `create-kerith` exists.

---

## 8. Versioning and publication status

All packages version in lockstep from this monorepo and publish independently to the `@kerith` npm scope (`create-kerith` is unscoped, following the `npm create <name>` → `create-<name>` convention). During the v2 alpha cycle, the `@alpha` dist-tag is used — there is no `latest` published yet.

`@kerith/core` starts at v2.0.0 because it is the direct evolution of Nodulus (`@vlynk-studios/nodulus-core`): v2.0.0 introduces the Domain Hierarchy architecture (`Domain → Module → SubModule`). The v1.0.0–v1.8.2 history under the Nodulus name is documented in `core`'s `CHANGELOG.md`.

**Known alpha-cycle limitations:**

- Mode B of `kerith init` (running in a directory with an existing `package.json`) is disabled — `create-kerith` follows the same restriction: it only scaffolds new projects and refuses to run against a directory that already has a `package.json`.
- `@kerith/app` and `@kerith/identifiers` still aren't published to npm (see section 1).
- `create-kerith`'s interactive channel selection has no non-interactive equivalent: `--yes` runs generate the `app` template with no channel stubs.

---

## 9. Where to look for what

| I need...                                                                | I go to...                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A deep explanation of Domain/Module/SubModule, Shared, NITS, or Channels | [`docs/concepts/README.md`](./concepts/README.md)                         |
| API, CLI, and config reference for `@kerith/core`                        | [`packages/core/README.md`](../packages/core/README.md)                   |
| Provider interfaces and adapters for `@kerith/app`                       | [`packages/app/README.md`](../packages/app/README.md)                     |
| The full identifier catalog                                              | [`packages/identifiers/README.md`](../packages/identifiers/README.md)     |
| `create-kerith` flags and templates                                      | [`packages/create-kerith/README.md`](../packages/create-kerith/README.md) |
| Extension API design decisions (with recorded trade-offs)                | `packages/core/ARCHITECTURE_DECISIONS.md`                                 |
| v1 (flat) → v2 (domains) migration                                       | `packages/core/MIGRATION.md`                                              |
| How every package fits together (this document)                          | `docs/architecture.md`                                                    |
