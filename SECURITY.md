# Security Policy

**Package:** `@kerith/core`
**Current Stable Version:** 1.8.2
**Current Pre-release:** 2.0.0-alpha.1
**Maintained by:** Vlynk Studios
**Repository:** https://github.com/kerithjs/kerith

---

## Supported Versions

Only the latest stable release receives security patches. The `2.0.0-alpha.x` line receives best-effort fixes during the alpha period, but is **not recommended for production** — see [Alpha Disclaimer](#alpha-disclaimer-2000-alphax) below.

| Version       | Supported                          |
| ------------- | ---------------------------------- |
| 2.0.0-alpha.x | ⚠️ Best-effort, not for production |
| 1.8.x         | ✅ Yes (current stable)            |
| 1.7.x         | ⚠️ Critical only                   |
| < 1.7         | ❌ No                              |

---

## Alpha Disclaimer (2.0.0-alpha.x)

`@kerith/core@2.0.0-alpha.1` is a pre-release intended for community feedback on the v2 architecture. It has not undergone the same production-hardening period as the `1.8.x` line.

- **Do not use in production.** Use `1.8.2` (`npm install @kerith/core`) for anything user-facing.
- Install the alpha explicitly via its dist-tag: `npm install @kerith/core@alpha`. It is never published under `latest`.
- Security reports against the alpha are still welcome and follow the same disclosure process below — but the response timeline in the [Responsible Disclosure Timeline](#responsible-disclosure-timeline) section applies to the stable line first. Alpha-only issues (i.e., not reproducible on `1.8.x`) are addressed as time allows, not under the 90-day SLA.
- The registry/NITS format has changed since `1.8.x` (see [What Changed in v2](#what-changed-in-v2) below) — do not mix `.kerith` state directories between a `1.8.x` and a `2.0.0-alpha.x` install of the same project.

---

## Reporting a Vulnerability

If you discover a security vulnerability in `@kerith/core` (stable or alpha), **do not open a public GitHub issue**. Instead, please report it responsibly through one of these channels:

- **GitHub Security Advisories:** Open a private advisory at `https://github.com/kerithjs/kerith/security/advisories/new`
- **Email:** Contact the maintainers directly via the email listed in the repository profile.

Please include the following in your report:

- A clear description of the vulnerability and the affected component.
- Steps to reproduce or a minimal proof-of-concept.
- The potential impact and attack surface.
- The version(s) affected — **please specify `1.8.x` or `2.0.0-alpha.x` explicitly**, as the internal registry format differs between them.

We aim to acknowledge all reports within **48 hours** and to provide a resolution timeline within **7 days** of acknowledgment for the stable line. See the alpha disclaimer above for pre-release timelines.

---

## Security Architecture Overview

`@kerith/core` is a **build-time and bootstrap-time structural layer** for Express.js applications. It is not a web server, authentication provider, or network-facing service. Its attack surface is confined to:

- The developer's local filesystem during `createApp()` bootstrap.
- The `kerith check` CLI command during CI/CD analysis.
- The NITS registry files written to and read from disk — the global registry (`.kerith/registry.json`) and, as of `2.0.0-alpha.1`, per-domain registries (`.kerith-register/registry.json`, one per domain directory).
- Node.js ESM Hooks registered at runtime for alias resolution.

No user-supplied HTTP request data flows through this library at runtime.

---

## What Changed in v2

For anyone auditing the alpha against the `1.8.x` security model described below, the relevant structural differences are:

- **Domain registries.** Modules that fall inside a `Domain()` boundary are no longer written to the global `.kerith/registry.json`. Instead, they are bucketed into a `.kerith-register/registry.json` file inside their owning domain's directory. Each record carries a `domain` field. This is a pure reorganization of _where_ identity records live — the validation rules described in [NITS Registry](#3-nits-registry-srcnitsnits-storets) below (schema validation, atomic writes, immutable `createdAt`) apply identically to domain registries.
- **Domain IDs.** Domains are now assigned a stable `dom_{hex8}` identity, generated and validated the same way `mod_{hex8}` module IDs are (see [Module ID format validation](#3-nits-registry-srcnitsnits-storets)).
- **Coupling and quality rule warnings** (`fan-out`/`fan-in`, module depth, module size, unused exports) are new in `kerith check` output. These are advisory (`severity: 'warn'`) and never affect the security posture of a project — they are static-analysis warnings about design, not enforcement of a trust boundary.
- No changes to the ESM alias resolver, the bootstrap duplicate-guard, or the config loading model described below — those sections apply unchanged to `2.0.0-alpha.1`.

---

## Security Properties by Component

### 1. ESM Alias Resolver (`src/aliases/resolver.ts`)

The alias resolver hooks into the Node.js module resolution pipeline via `node:module`'s `register()` API (requires Node.js ≥ 20.6.0).

**Protections in place:**

- All alias targets are **normalized to absolute paths** during registration, eliminating path-traversal risks from relative aliases containing `../` sequences.
- Alias registration is **content-addressable (idempotent)**: a SHA-based hash of the serialized alias map is stored in `registeredHashes`. Duplicate calls to `createApp()` with the same aliases do not re-register hooks, preventing race conditions in hot-reload scenarios.
- A **singleton promise pattern** (`_registrationPromise`) ensures that concurrent activations from asynchronous bootstrap paths converge safely.
- User-defined aliases always override auto-generated `@modules/*` aliases, providing a predictable priority order that prevents shadowing attacks within the local codebase.

**Known limitation:**

> This resolver is strictly for Node.js ESM pipelines. CJS environments and bundlers (Vite, esbuild) must use `getAliases()` to configure their own resolvers. Passing a CJS project will cause an early `INVALID_ESM_ENV` error before any alias logic executes.

---

### 2. Bootstrap Pipeline (`src/bootstrap/createApp.ts`)

`createApp()` is the main entry point. It orchestrates configuration loading, module discovery, NITS reconciliation, and Express router mounting.

**Protections in place:**

- **Duplicate bootstrap guard:** The function checks for a `__KerithBootstrapped` flag on the Express `app` object before proceeding. A second call with the same instance throws `DUPLICATE_BOOTSTRAP` immediately, preventing double-registration of routes or state corruption.
- **ESM environment validation:** The function reads `package.json` to verify `"type": "module"` is present before any module loading occurs. Non-ESM projects fail fast with `INVALID_ESM_ENV`.
- **Strict mode:** When `strict: true` (default in non-production environments), undeclared cross-module imports detected at runtime cause an immediate `UNDECLARED_IMPORT` error, enforcing explicit dependency declaration.
- **NITS as an audit-only layer:** NITS I/O errors (disk failures, corrupted registry — global or per-domain) are caught and surfaced as `console.warn` messages. They never abort the Express bootstrap, preventing a corrupted registry file from taking down the application server.
- **No user-controlled input:** `createApp()` reads only from `kerith.config.ts/js` and the local filesystem. No data from HTTP requests or external network sources is processed.

---

### 3. NITS Registry (`src/nits/nits-store.ts`, `src/nits/domain-store.ts`)

The NITS (Native Identity Tracking System) assigns stable `mod_{hex8}` identities to modules and `dom_{hex8}` identities to domains, persisting them to `.kerith/registry.json` (global) or `.kerith-register/registry.json` (per-domain, new in `2.0.0-alpha.1`).

**Protections in place:**

- **Strict schema validation on load:** `loadNitsRegistry()` rejects any registry file that does not conform to the expected schema. All required fields (`name`, `path`, `hash`, `status`, `createdAt`, `lastSeen`, `identifiers`, plus `domain` where applicable) are validated per module record. A single malformed record causes the entire registry to be discarded and re-initialized (not partially applied), eliminating partial-corruption scenarios. Domain registries follow the same all-or-nothing validation.
- **Module and domain ID format validation:** Module keys are validated against `/^mod_[0-9a-f]{8}$/` and domain IDs against `/^dom_[0-9a-f]{8}$/`, both via dedicated validators. Records with keys that do not match are rejected. This prevents injection of arbitrary strings as identifiers.
- **Version mismatch warning:** If a registry's `version` field does not match the expected schema version, a warning is emitted. The registry is still loaded (non-breaking), but operators are notified of the schema drift.
- **Atomic writes:** Both `saveNitsRegistry()` and `saveDomainRegistry()` use a write-then-rename strategy (`registry.json.tmp` → `registry.json`). This ensures a registry file is never left in a partially written state even if the process is killed mid-write.
- **Immutable `createdAt` timestamps:** The `createdAt` field is set once on module creation and never overwritten by the reconciler, providing a tamper-evident creation timestamp for each module identity.
- **Clone before save:** Registry objects are cloned before being written to disk to prevent accidental mutation of the in-memory object after the save call returns.
- **Full reconstruction per cycle:** Both the global and per-domain registries are rebuilt completely on every bootstrap cycle rather than diffed incrementally. A module that moves from the global scope into a newly created domain (or vice versa) simply stops being written to its old location — there is no separate "migration" step that could be skipped or corrupted.

**Files should be committed to Git:**

> Registry files explicitly instruct teams to include `.kerith/registry.json` and any `.kerith-register/registry.json` files in version control. Omitting them from Git would cause all module and domain IDs to be regenerated on every fresh clone, defeating the purpose of stable identity tracking.

---

### 4. CLI Analyzer (`src/cli/commands/check.ts`)

The `kerith check` command performs static AST analysis of the project's source files to detect architectural violations and, as of `2.0.0-alpha.1`, coupling and quality warnings.

**Protections in place:**

- **AST-based analysis only:** The CLI uses `acorn` for parsing. It reads source files from the local filesystem and does not execute them. No `eval()` or dynamic code execution occurs during analysis.
- **Transient file-lock resilience:** File-locking incidents encountered during batch analysis (e.g., from concurrent editors or other processes) are handled gracefully. The pipeline emits a warning and continues rather than crashing (`CLI_ERROR` is caught and reported cleanly).
- **Graph ID mapping fix:** A legacy bug (N-34) where the CLI improperly looked up module IDs by name instead of NITS ID has been fixed since v1.4.0, eliminating a class of identity mapping failures that could cause incorrect violation attribution.
- **`--strict` mode for CI:** When `--strict` is passed, the command exits with code `1` on any system-rule violation. As of `2.0.0-alpha.1`, quality-rule warnings (fan-out/fan-in, module depth, module size, unused exports) only affect the exit code under `--strict` as well — they never block a default (non-strict) run.
- **`--format json`:** Machine-readable output avoids log injection risks from unescaped module names in terminal output.

---

### 5. Configuration Loading (`src/core/config.ts`)

**Protections in place:**

- Configuration files (`kerith.config.ts`) are loaded from the **current working directory only**. There is no mechanism to load configuration from a remote URL or an arbitrary filesystem path.
- If a `.ts` config file is found in an environment that cannot transpile TypeScript (e.g., production without a loader), the error message explicitly instructs the operator to use a compiled `.js` config or run with `tsx`/`ts-node`. This prevents silent misconfiguration.
- The merge strategy (`options > fileConfig > defaults`) ensures that programmatic options passed to `createApp()` always take precedence over file-based configuration, preventing a malicious config file from overriding a security-sensitive programmatic setting.

---

### 6. Registry Isolation (`src/core/registry.ts`)

- The in-memory module registry is scoped to each `createApp()` call via `AsyncLocalStorage`. This ensures complete isolation between concurrent requests or test runs sharing the same Node.js process.
- **Duplicate name detection:** `registerModule()` validates for name uniqueness _before_ mutating internal maps (fixed in v1.4.0 via REGLA-14). A duplicate module name throws `DUPLICATE_MODULE` before any state is written, preventing silent registry overwrites.
- **Internal API surface:** The `InternalRegistry` interface (with mutators like `clearRegistry()`) is explicitly marked `@internal` and not exported from the public `src/index.ts` surface.

---

## Known Security Considerations and Limitations

### Alias Path Injection via `kerith.config`

Since Kerith loads `kerith.config.ts/js` as a native ESM module, a **malicious config file** could theoretically execute arbitrary code during `createApp()`. This is an accepted risk inherent to all config-as-code patterns (similar to `vite.config.ts`, `webpack.config.js`, etc.). Mitigation lies outside the library scope: treat your project's config files as trusted code and review them like any other source file.

### Registry File Tampering

Registry files (`.kerith/registry.json` and `.kerith-register/registry.json`) are validated on load but are not cryptographically signed. A developer with write access to the repository could manually forge module IDs, domain IDs, or timestamps. This is mitigated by the strict schema and ID-format checks, which will reject obviously malformed records, but a carefully crafted valid-looking forgery could be accepted. This is considered acceptable for a developer-tooling package.

### `Controller` Excluded from Semantic Hashing (BUG-1, fixed in v1.4.0)

Prior to v1.4.0, the `Controller` identifier was included in the NITS semantic hash, causing HTTP route paths (e.g., `"/users"`) to be stored as module identifiers. This produced Jaccard = 1.0 false positives between unrelated modules sharing route prefixes, potentially causing NITS to assign the wrong stable ID to a module after a rename. **Fixed in v1.4.0** by removing `Controller` from `targetCallees`; only `Service`, `Repository`, and `Schema` are semantic identity carriers. This remains unchanged in `2.0.0-alpha.1`.

### Node.js Minimum Version

Kerith requires **Node.js ≥ 20.6.0** for the `--import` flag and native ESM Hooks API (`node:module` `register()`). Running on older Node.js versions will fail at the ESM environment validation step. Ensure your deployment infrastructure and CI pipeline enforce this minimum.

### ESM-Only

Kerith dropped CommonJS support in v1.0.0. Projects attempting to use Kerith in a CJS context will receive an `INVALID_ESM_ENV` error immediately. There is no CJS compatibility shim, and none is planned.

### Mixed Registry Formats Across Major Versions

Do not point a `2.0.0-alpha.x` install at a project whose `.kerith/` directory was last written by `1.8.x`, or vice versa, without a clean re-scan. The registry schema and domain-bucketing behavior differ between the two lines; loading a `1.8.x` registry under `2.0.0-alpha.x` (or the reverse) is not a supported migration path during the alpha period.

---

## Dependency Security

| Dependency     | Version | Role                                     |
| -------------- | ------- | ---------------------------------------- |
| `commander`    | 14.0.3  | CLI argument parsing                     |
| `fast-glob`    | 3.3.3   | Module directory discovery (glob)        |
| `picocolors`   | 1.1.1   | Terminal color output (logging)          |
| `comment-json` | 4.6.2   | Preserves comments in `tsconfig.json`    |
| `acorn`        | 8.16.0  | AST parser for `kerith check` (dev/peer) |

All production dependencies are minimal and widely audited. Run `npm audit` regularly to detect upstream vulnerabilities.

**Peer dependency:** `express >= 5.0.0` — Kerith does not bundle Express and defers all HTTP handling to the host application.

---

## Security-Relevant Changelog Highlights

| Version           | Change                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.0.0-alpha.1** | Domain registries introduced (`.kerith-register/registry.json` per domain), with the same schema-validation and atomic-write guarantees as the global registry. |
| **2.0.0-alpha.1** | `dom_{hex8}` domain identity, validated the same way as `mod_{hex8}` module identity.                                                                           |
| **2.0.0-alpha.1** | Coupling (fan-out/fan-in) and quality-rule warnings added to `kerith check` — advisory only, `severity: 'warn'`, never affect exit code outside `--strict`.     |
| **1.4.0**         | BUG-1: Removed `Controller` from NITS hash targets (false-positive identity matches).                                                                           |
| **1.4.0**         | BUG-2: Fixed invalid `mod_users_legacy` ID in test fixture bypassing `isValidModuleId`.                                                                         |
| **1.4.0**         | BUG-3: Fixed missing `hash`/`createdAt` fields causing `undefined` keys in `activeHashes` map.                                                                  |
| **1.4.0**         | CODE-2: `isValidRegistry` now validates all 7 required fields per module record.                                                                                |
| **1.4.0**         | REGLA-14: `registerModule` now checks name uniqueness before mutating state.                                                                                    |
| **1.4.0**         | REGLA-31: Reconciler now uses `normalizePath` for consistent cross-platform path comparison.                                                                    |
| **1.4.0**         | N-48: Fixed `candidate` records persisting in identity limbo (orphaned registry entries).                                                                       |
| **1.4.0**         | N-46: CLI `kerith check` no longer crashes on transient file-locking incidents.                                                                                 |
| **1.3.0**         | N-25: `loadNitsRegistry` now emits the underlying parse error before soft-resetting a corrupted registry.                                                       |
| **1.2.6**         | `ALIAS_NOT_FOUND` now fails fast on nonexistent alias targets at bootstrap.                                                                                     |
| **1.2.6**         | `UNDECLARED_IMPORT` correctly enforced in strict mode, harmonizing runtime and CLI guarantees.                                                                  |
| **1.2.5**         | Atomic write strategy introduced for `saveNitsRegistry`.                                                                                                        |
| **1.2.5**         | ESM Hook singleton promise prevents race conditions during concurrent activations.                                                                              |
| **1.0.0**         | Fixed race conditions and duplicate registration errors in hot-reload scenarios.                                                                                |

---

## Responsible Disclosure Timeline

We follow a **90-day responsible disclosure policy** for the stable (`1.8.x`) line. If a reported vulnerability is not resolved within 90 days of the initial report, the reporter is free to disclose it publicly. We will always credit researchers who report issues responsibly unless they prefer to remain anonymous.

For issues specific to the `2.0.0-alpha.x` pre-release, see the [Alpha Disclaimer](#alpha-disclaimer-2000-alphax) section above — the 90-day SLA is not guaranteed during the alpha period, though we still aim to acknowledge reports within 48 hours.

---

_Last updated: 2026-07-04 — `@kerith/core` 1.8.2 (stable) / 2.0.0-alpha.1 (pre-release)_
