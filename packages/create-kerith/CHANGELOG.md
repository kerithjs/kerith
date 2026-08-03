# Changelog — create-kerith

All notable changes to this package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the full Kerith suite changelog (all packages), see the [root CHANGELOG](../../CHANGELOG.md).

---

## [1.0.0-alpha.1] — 2026-08-02

> **Initial release of `create-kerith`.** A scaffolding CLI (`npm create kerith@alpha`) that generates ready-to-run Kerith projects from two templates: `core` (bare `@kerith/core`) and `app` (`core` + `@kerith/app` + `@kerith/identifiers`, with optional channel stubs). The `app` template does not duplicate project generation — it reuses `generateProjectStructure` from `@kerith/core/cli` and patches the result, so both templates stay in sync with whatever `kerith init` produces.

### Added

- Interactive CLI (`@clack/prompts`) asking for project name, template (`core`/`app`), language (`ts`/`js`), port, route prefix, and — for the `app` template — which channels to scaffold.
- Non-interactive mode (`--yes`) with full flag support: `--template`, `--language`, `--port`, `--prefix`, `--out-dir`, `--no-install`.
- `core` template: thin wrapper around `@kerith/core/cli`'s `generateProjectStructure`, producing the exact same project `kerith init` would generate.
- `app` template: patches the `core` output to add `@kerith/app` and `@kerith/identifiers` as dependencies, rewrites `src/server.{ts,js}` and `kerith.config.{ts,js}` to import from `@kerith/app` (so channel executors are actually wired in), and generates one stub per selected channel — `Alias`, `Middleware`, `Cron`, `Worker`, `Gateway` — using the real signatures exported by `@kerith/identifiers`.
- Channel-conditional dependencies: `ioredis` (Redis stub), `socket.io` (Gateway with Socket.io), `bullmq` (Worker), `node-cron` (Cron) — added only when the corresponding channel is selected.
- Dynamic version resolution (`src/versions.ts`): `@kerith/core`, `@kerith/app`, and `@kerith/identifiers` versions are read from the installed packages at runtime instead of being hardcoded, so the generated `package.json` never drifts from what's actually installed.
- Post-generation sync step: runs `kerith sync-preload` (and `kerith sync-tsconfig` for TypeScript projects) automatically after scaffolding, matching what `kerith init` does on its own.
- `sanitizeProjectName()` — normalizes project names (lowercase, spaces to hyphens, invalid characters stripped) so `npm install` never fails on an invalid `package.json` name.
- Test suite: 8 test files / 57 tests covering both templates, channel stub generation (per channel and per language), version resolution, prompt defaults, and file writing — including fixture snapshots (`tests/fixtures/core-project`, `tests/fixtures/app-project`).

### Fixed

- **Duplicate shebang in the built CLI.** `tsup`'s `banner` was adding a second `#!/usr/bin/env node` on top of the one already in `src/index.ts`, making `dist/index.js` throw `SyntaxError: Invalid or unexpected token` on execution. The `banner` was removed from `tsup.config.ts`; the shebang now comes from the source file only.
- **Generated projects were not written into their own folder.** `--out-dir` defaulted to `.` and was never joined with the project name, so running the CLI wrote files directly into the current working directory instead of `./<project-name>/`. `index.ts` now resolves the target directory as `<out-dir ?? cwd>/<project-name>` unless `--out-dir` is explicitly provided.
- **Silent success when scaffolding into an already-initialized directory.** Previously relied solely on `@kerith/core`'s `validateDirectoryGuard`, which exits with code `0` and no error when a `package.json` already exists — combined with the `--out-dir` bug above, this could silently do nothing. `create-kerith` now performs its own pre-check with an explicit error message and a non-zero exit code before delegating to `core`'s guard.
- **`validateDirectoryGuard` was called twice** (once in the `core` template generator, once in the file writer) — removed the redundant call, kept it only at the single point where files are actually written.
- **Identifier channels were completely inaccessible.** `IMPLEMENTED_CHANNELS` was left empty (all five channels commented out) even though `channel-stubs.ts` was fully implemented and tested, so the `app` template's channel prompt never appeared. All five channels are now enabled.
- **Channel stubs ignored the selected language.** `channel-stubs.ts` hardcoded `.ts` file paths and TypeScript-only syntax regardless of `--language js`. Stubs now respect the chosen language for both file extension and syntax.
- **`--port` accepted invalid values in non-interactive mode.** `parseInt(options.port, 10)` produced `NaN` when passed a non-numeric string via `--yes`, which flowed straight into the generated `server.ts`. The same validation used by the interactive prompt is now applied to the flag.
- **`--template` accepted invalid values silently.** An unrecognized value (e.g. `--template foo`) fell through to the `core` template without warning. Invalid values now exit with a clear error instead.
- **Missing optional dependencies for `worker`/`cron` channels.** `bullmq` and `node-cron` are peer dependencies of `@kerith/app` needed by the `Worker` and `Cron` channels respectively, but were never added to the generated `package.json`. Both are now added conditionally, alongside the existing `ioredis`/`socket.io` handling.

### Documentation

- `README.md` rewritten to document every CLI flag, the `core`/`app` template differences, the channel-to-dependency mapping, and a short "how it works" section describing the wrap-and-patch design (no duplicated generator logic).
- Fixed `README.md` describing the `core` template as including "channels" — those are exclusive to the `app` template.
- Switched the documented install command from `npm create kerith@latest` to `npm create kerith@alpha`, consistent with the rest of the suite during the `2.0.0-alpha.x` cycle (there is no `latest` dist-tag published yet).
- All CLI and log output standardized to English (previously mixed with a few Spanish strings in the post-generation sync step).

### Known limitations

- Channel selection is only available in the interactive flow — there is no `--channels` flag yet for choosing channels non-interactively with `--yes`. Non-interactive runs of the `app` template currently generate no channel stubs.
- Not yet published to npm. `npm create kerith@alpha` will work once published; until then, use the local build (`node packages/create-kerith/dist/index.js`) from within this monorepo, where `@kerith/core`, `@kerith/app`, and `@kerith/identifiers` resolve through npm workspaces.
