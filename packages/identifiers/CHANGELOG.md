# Changelog — @kerith/identifiers

All notable changes to this package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the full Kerith suite changelog (all packages), see the [root CHANGELOG](../../CHANGELOG.md).

---


## [1.0.0-alpha.1] - Unreleased

### Changed
- **BREAKING**: minimum supported Node version raised to 24 LTS



> **Initial release of `@kerith/identifiers`.** Introduces the extended declarative identifier catalog on top of `@kerith/core`. All identifiers register into one of four Extension API channels (`alias`, `middleware`, `schedule`, `binding`) and are wired to life by `@kerith/app`.

### Added

#### Infrastructure — Alias channel

- **`Client`** — HTTP clients, database drivers, SDK instances.
- **`Config`** — Configuration objects and feature flags.
- **`Provider`** — Service providers and factory functions.
- **`Store`** — State stores (Redis, in-memory, etc.).
- **`Adapter`** — External system integrations (port/adapter pattern).

#### Security — Middleware channel

- **`Guard`** — Synchronous or async security checks. Responds with `401` on failure. Accepts a custom `message`.
- **`RateLimit`** — Token-bucket rate limiting. Accepts `limit`, `windowMs`, and `message`.
- **`Validate`** — Request body validation. Accepts a schema (e.g. Zod/Valibot) and replaces `req.body` with the parsed output. Responds with `400` on failure.

#### HTTP — Middleware channel

- **`Middleware`** — Generic Express middleware. Mounts to all controllers that declare it by name.
- **`Filter`** — Express error handler (`4-arg`) scoped to a specific `Error` subclass. Maps errors to structured HTTP responses.

#### Workers — Schedule channel

- **`Cron`** — Scheduled tasks backed by `node-cron`. Accepts a standard cron expression and a handler.

#### Workers — Binding channel

- **`Worker`** — Background job processors backed by `bullmq`. Binds a named queue to a handler function.

#### Events — Binding channel

- **`Message`** — Redis Streams consumer group handler. Processes messages with at-least-once delivery semantics via `XREADGROUP`.

#### Realtime — Binding channel

- **`Stream`** — Redis Streams reader (fan-out / pub-sub pattern). Processes entries via `XREAD` with backpressure.
- **`Gateway`** — Socket.io realtime gateway. Binds a handler to a namespace and receives the socket on connection.

#### Observability — Schedule channel

- **`HealthCheck`** — Periodic health probe. Runs on a schedule and exposes a pass/fail signal.
- **`Probe`** — Lightweight liveness or readiness probe.

#### Catalog

- **`IDENTIFIER_CATALOG`** — Full metadata catalog (name, category, kind, channel, trackable) for all 70+ identifiers in the suite, including structural identifiers not yet backed by a runtime. Registered into `@kerith/core` at boot time by `@kerith/app`.

#### Internal channels API

- **`getAliasPlugins()`** / **`getMiddlewarePlugins()`** / **`getSchedulePlugins()`** / **`getBindingPlugins()`** — Read-only getters consumed by `@kerith/app` channel executors.
- **`_resetAllChannels()`** — Test utility to clear all internal plugin stores between test runs.

### Notes

- `Message()` and `Stream()` are available to declare in this alpha but require `ioredis` to be installed and a live Redis instance to consume at runtime.
- `Worker()` requires `bullmq` and a live Redis connection.
- `Gateway()` requires `socket.io`.
- All peer dependencies (`bullmq`, `ioredis`, `socket.io`, `node-cron`) are optional — the package loads gracefully without them and only throws `MISSING_PEER_DEPENDENCY` at the point the corresponding channel executor runs.
