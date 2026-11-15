# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** Kerith 2.0.0 succeeds Nodulus (≤1.8.2). Releases prior to 2.0.0 were developed under `@vlynk-studios/nodulus-core`. For migration guidance and project asset renaming, see [MIGRATION.md](./MIGRATION.md).

## [2.0.0-alpha.1] - 2026-07-26

### Breaking Changes

- **Node.js Requirement**: Minimum supported Node.js version is now **Node ≥24.0.0** (aligned with `package.json` `engines`). Native on-thread ESM customization hooks now use `node:module`'s `registerHooks()` API with synchronous `resolve` and `load` hooks and `.deregister()` lifecycle.
- **Nodulus Succession**: Rebranded and restructured from Nodulus (≤1.8.2) to Kerith 2.0. The npm package is `@kerith/core`, the CLI binary is `kerith`, the configuration file is `kerith.config.ts`, and the cache/state directory is `.kerith/`.

### Added

- **Domain-Driven Hierarchy**: Inferred `Domain → Module → SubModule` architecture directly from the filesystem layout.
  - `origin` config key: single scan root replacing separate `domains`/`modules` config.
  - `Domain()` identifier: semantic marker for domain boundaries.
  - `SubModule()` identifier: implementation unit within a module.
  - Domain-scoped aliases: `@{domain}`, `@{domain}/{module}` automatically registered.
  - CLI commands: `kerith create-domain`, `kerith create-submodule`, `kerith create-module --domain`.
- **Shared Code Boundaries**:
  - Global shared (`@shared`): located in `src/shared/`, declared via `shared: ['@shared']` in `Module()`.
  - Domain-scoped shared (`@{domain}/shared`): located in `src/{domain}/_shared/`, accessible implicitly by domain modules.
  - CLI commands: `kerith create-shared --domain <name>` and `kerith create-shared --global`.
  - Architecture checks: `kerith check` detects `UNDECLARED_SHARED`, `UNUSED_SHARED`, and `SHARED_SCOPE_VIOLATION`.
- **Architecture & Coupling Rules**:
  - `kerith check` reports violations across Domains, Modules, and SubModules.
  - Architectural boundary rules: `DOMAIN_BOUNDARY_VIOLATION`, `RELATIVE_BOUNDARY_VIOLATION`, `MODULE_SPACE_CONFLICT`, `SUBMODULE_DOMAIN_BYPASS`, `SUBMODULE_DIRECT_SIBLING`.
  - Coupling analysis: detects `FAN_OUT_HIGH` and `FAN_IN_HIGH` based on configurable thresholds in `kerith.config.ts`.
- **Extension API Subpath (`@kerith/core/extension`)**:
  - Exposes internal extension registration methods (`registerAliasProvider`, `registerMiddlewareResolver`, `registerScheduleProvider`, `registerBindingProvider`, `registerIdentifierMetadata`).
  - *Internal API*: Exclusively consumed by `@kerith/app` to wire higher-level channels (Schedule, Middleware, Alias, Binding). Carries no semver stability guarantees for end developers.
- **Class-Based Controller & Route Decorator Bridge**:
  - Internal bridge in `app-controller-bridge.ts` to support decorated controller classes and route metadata when `@kerith/app` is present.
  - Route-level middleware resolution for pre-handlers (such as guards, rate limiters, and schema validators).
- **TypeScript & Preload Tooling**:
  - `kerith sync-tsconfig`: generates `tsconfig.kerith.json` extending IDE paths for domains, modules, and shared roots.
  - `kerith sync-preload`: generates `.kerith/preload.js` with `registerHooks()` for zero-overhead startup.

### Changed

- **Bootstrap Pipeline**: Refactored `createApp()` into an explicit step-based pipeline (`step-00` through `step-09`) with an isolated `BootstrapContext`.
- **Optional Express App**: `createApp(app?)` allows omitting the Express instance for worker or CLI execution modes.
- **Homonymous Modules**: Module keys in the internal registry use `domain/name`, allowing identically named modules in different domains without collisions.
- **Optimized Scanning**: Module scanner uses a single unified glob scan, eliminating redundant filesystem passes.
- **Bootstrap Log Capping**: Console output for domains, modules, and routes is capped to 3 visible lines per category at `info` level to prevent terminal clutter, with full details available at `debug` level.
- **Severity-Based Diagnostics**: Exit-code handling in `kerith check` derives from rule severity (`severity: 'error'` exits with code 1; `severity: 'warn'` reports warnings and exits with 0 unless `--strict` is enabled).
- **Circular Dependency Severity**: `CIRCULAR_DEPENDENCY` is categorized as a warning, blocking only when `--strict` is active.

### Fixed

- Purge cycles default aligned with configured threshold (`stalePurgeCycles: 5`).
- Modules without controllers no longer emit spurious warnings.
- AST parser fallback captures string and array literals from decorator and identifier options via TypeScript compiler AST.
