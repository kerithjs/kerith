# Kerith — Suite Changelog

All notable changes to the **Kerith suite** are documented here.
This file covers both [`@kerith/core`](./packages/core) and [`@kerith/eslint-plugin`](./packages/eslint-plugin).
Both packages are versioned in lockstep and published independently to npm.

For full technical details, see the individual package changelogs:
-> [`packages/core/CHANGELOG.md`](./packages/core/CHANGELOG.md)
-> [`packages/eslint-plugin/CHANGELOG.md`](./packages/eslint-plugin/CHANGELOG.md)

> **Note:** v1.0.0 - v1.8.1 were developed under the `Nodulus` repository
> prior to the KerithJS rebranding. Full history is preserved below for reference.

## [1.8.2] - 2026-06-03

### @kerith/core

- **Rebranding**: Project renamed from Nodulus to **Kerith** (internal rename, no public API changes).
  - NPM package: `@vlynk-studios/nodulus-core` -> `@kerith/core`
  - CLI binary: `nodulus` -> `kerith`
  - Config file: `nodulus.config.*` -> `kerith.config.*`
  - NITS directory: `.nodulus/` -> `.kerith/`
  - Preload global: `__NODULUS_PRELOAD_CONFIG__` -> `__KERITH_PRELOAD_CONFIG__`
  - Generated tsconfig: `tsconfig.nodulus.json` -> `tsconfig.kerith.json`
  - IPC signal: `nodulus:shutdown` -> `kerith:shutdown`

### @kerith/eslint-plugin

- **Rebranding**: Plugin renamed from `@vlynk-studios/eslint-plugin-nodulus` to `@kerith/eslint-plugin`.
  - Rule prefix: `nodulus/*` -> `kerith/*`

---

## [1.8.1] - 2026-05-28

### @kerith/core

- **Bug Fix**: Fixed a failing test in `tsconfig-generator.test.ts` due to a mismatch in log emission levels.
- **Internal**: Re-triaged items N-50, N-51, N-55 into the resolved section of Backlog.md.

### @kerith/eslint-plugin

- Version synchronized with `@kerith/core@1.8.1`. No new rules or behavioral changes.

---

## [1.8.0] - 2026-05-27

### nodulus-core

- **Configuration Unification**: `createApp()` no longer accepts declarative configuration options.
- **Graceful Shutdown**: `onShutdown` hook moved to `nodulus.listen(server, { onShutdown })`.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.8.0`. No new rules or behavioral changes.

---

## [1.7.0] - 2026-05-25

### nodulus-core

- **Alias system**: `nodulus.config.ts` as the single source of truth; automatic `tsconfig.nodulus.json` generation.
- **Module boundaries**: `RELATIVE_BOUNDARY_VIOLATION` for relative imports crossing module directories.
- **REGLA-22**: import scanner filters by active Nodulus aliases.

### eslint-plugin-nodulus

- `no-private-imports` reports `relativeBoundary` for cross-module relative imports.

---

## [1.6.0] - 2026-05-24

### nodulus-core

- Verification Triangle reconciler unit tests.
- Hardened `loadNitsRegistry()` validation.
- `INVALID_ESM_ENV` on non-ESM setups.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.6.0`. No new rules or behavioral changes.

---

## [1.5.8] - 2026-05-17

### nodulus-core

- **`nodulus check` Redesign**: Ayu Dark-themed report via `check-reporter.ts`.
- `--verbose` shows combined Architecture + Identity table.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.8`. No new rules or behavioral changes.

---

## [1.5.7] - 2026-05-16

### nodulus-core

- **NITS Delete Detection**: Shadow File ID-based move vs delete detection.
- Layer 1 and Layer 2 guards against build artifact contamination.
- Windows cross-platform path normalization.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.7`. No new rules or behavioral changes.

---

## [1.5.5] - 2026-05-11

### nodulus-core

- Shadow File (`.nodulus`): persistent module identity per directory.
- NITS resolution: Shadow File ID > path > Jaccard.
- `create-module` auto-generates the shadow file.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.5`. No new rules or behavioral changes.

---

## [1.5.3] - 2026-05-09

### nodulus-core

- Pino logger integration.
- `NODULUS_LOG_FORMAT` env var.
- `useLogger()` spawns Pino child loggers.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.3`. No new rules or behavioral changes.

---

## [1.5.2] - 2026-05-08

### nodulus-core

- `create-module` opt-in flags (`--service`, `--routes`, `--full`).
- NITS IDs hidden by default in `nodulus check` output.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.2`. No new rules or behavioral changes.

---

## [1.5.1] - 2026-05-07

### nodulus-core

- Integration test suite (`scenarios.test.ts`).
- Single root-level glob replaces per-module globs.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.1`. No new rules or behavioral changes.

---

## [1.5.0] - 2026-05-01

> **Headline: Runtime Pre-loader.** ESM aliases now available in top-level import statements.

### nodulus-core

- Runtime pre-loader hook via `node:module`.
- `nodulus sync-preload`: generates `.nodulus/preload.js`.
- `nodulus dev`: drop-in dev server with auto preload injection.
- Graceful shutdown via `nodulus.listen()`.
- `useLogger(name)` public API.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.5.0`. No new rules or behavioral changes.

---

## [1.4.0] - 2026-04-23

> **Headline: NITS + Alias Robustness.**

### nodulus-core

- NITS: stable `mod_{hex}` IDs persisted in `.nodulus/registry.json`.
- Alias Robustness Engine (P1-P7): complete overhaul.
- Bootstrap resilience: NITS as non-blocking audit layer.

### eslint-plugin-nodulus

- Version synchronized with `nodulus-core@1.4.0`. No new rules or behavioral changes.

---

## [1.3.1] - 2026-04-12

### nodulus-core

- Fixed NPM provenance publishing.
- Express v5 forward-compatibility hardening.

### eslint-plugin-nodulus

- Fixed NPM provenance failure.
- `plugin.meta.version` read dynamically from `package.json`.
- `no-undeclared-imports` reads `tsconfig.json` path mappings.

---

## [1.3.0] - 2026-04-12

> **Headline: ESLint Plugin - Initial Public Release.**

### nodulus-core

- NITS registry corruption warning with soft reset.
- `@domain/*` cross-module import support.

### eslint-plugin-nodulus Initial Release

- `no-private-imports` rule.
- `no-undeclared-imports` rule.
- `recommended` flat-config preset.

---

## [1.2.6] - 2026-04-11

### nodulus-core

- Publish CI version validation before npm dispatch.
- `UNDECLARED_IMPORT` runtime guard in strict mode.

---

## [1.2.5] - 2026-04-11

### nodulus-core

- NITS preview: stable `mod_{hex}` IDs first introduced.
- ESM hook singleton promise pattern.

---

## [1.2.0] - 2026-04-09

### nodulus-core

- `nodulus check`: static analysis with Acorn AST.
- `--strict` and `--format json` modes.

---

## [1.1.0] - 2026-04-08

### nodulus-core

- Centralized `getCallerInfo` into `src/core/caller.ts`.
- `nodulus --version` reads dynamically from `package.json`.
- `ERROR_MESSAGES` deprecated (removed in v2.0.0).

---

## [1.0.0] - 2026-04-05

> **Headline: Initial Release.**

### nodulus-core Initial Release

- `createApp()` bootstrap pipeline.
- `Module()`, `Controller()`, `Service()`, `Repository()`, `Schema()` identifiers.
- ESM Aliases via Node.js Hooks API.
- `nodulus` CLI with `create-module` and `sync-tsconfig`.
- ESM-only. Node.js >= 20.6.0.