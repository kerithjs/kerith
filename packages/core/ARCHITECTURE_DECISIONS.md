# Architecture Decisions - Extension API

This document records key architectural decisions made during the Extension API implementation.

## 1. Extension Store: Singleton Global vs AsyncLocalStorage

**Decision:** Keep as singleton global process store.

**Rationale:**
- In production, there is typically only one `createApp()` call per process
- The multi-app scenario (two real apps in the same process) is extremely rare in practice
- Moving to `AsyncLocalStorage` would add complexity without clear benefit
- `_resetExtensionStore()` exists for test isolation, which covers the primary multi-call scenario
- The registry also uses AsyncLocalStorage, but that's more critical for nested module resolution
- Extension providers are global by design (unlike modules which are scoped to domains)

**Trade-offs:**
- ✅ Simpler implementation, less complexity
- ✅ Consistent with current production patterns
- ❌ Cannot support two independent Kerith apps in the same process (rare edge case)
- ✅ Test isolation is handled via `_resetExtensionStore()`

## 2. Binding `kind` Field: String vs Enum

**Decision:** Keep as `string` (no enum in Core).

**Rationale:**
- Core must remain agnostic to specific binding implementations
- Enumerating `kind` in Core would violate the agnostic design principle
- `@kerith/app` can define and validate specific kinds (worker, processor, etc.)
- String allows third-party extensions to define custom kinds without Core changes
- Type safety can be enforced at the adapter layer (@kerith/app) rather than Core

**Trade-offs:**
- ✅ Core remains framework-agnostic
- ✅ Extensible for third-party adapters
- ❌ Less type safety at Core level (acceptable trade-off)
- ✅ Validation can be pushed to adapter layer

## 3. Alias `prefix` Field: String vs Enum

**Decision:** Keep as `string` (no enum in Core).

**Rationale:**
- Same reasoning as Binding `kind` - Core must remain agnostic
- Prefixes like "Client", "Store", "Vault" are defined by `@kerith/identifiers`
- Third-party packages can define custom prefixes without Core changes
- String allows flexibility for future alias categories

**Trade-offs:**
- ✅ Core remains framework-agnostic
- ✅ Extensible for third-party packages
- ❌ Less type safety at Core level (acceptable trade-off)
- ✅ Validation enforced by `@kerith/identifiers` catalog

## 4. Message/Stream Transport Library

**Decision:** Defer to adapter layer with lazy-loading.

**Rationale:**
- Core should not mandate a specific transport (Kafka, RabbitMQ, etc.)
- Different use cases require different transports (cloud vs on-prem, scale requirements)
- Lazy-loading allows adapters to choose their preferred transport
- Does not block writing the executor - adapter can be lazy-loaded
- Users can choose the transport that fits their infrastructure

**Implementation Strategy:**
- Core defines the `Message` and `Stream` identifiers in the Binding channel
- `@kerith/app` provides adapters for common transports (BullMQ, Kafka, RabbitMQ)
- Third-party packages can provide custom transport adapters
- Transport selection happens at the adapter layer, not Core

**Trade-offs:**
- ✅ Maximum flexibility for users
- ✅ Core remains transport-agnostic
- ✅ Supports multiple transports simultaneously
- ❌ No default transport out-of-the-box (acceptable - adapter provides it)
- ✅ Lazy-loading avoids unnecessary dependencies

## 5. filePath Field in Middleware, Schedule, Binding

**Status:** Already implemented.

**Current State:**
- `MiddlewareResolver` has `filePath` field
- `ScheduleProvider` has `filePath` field  
- `BindingProvider` has `filePath` field
- `AliasProvider` has `filePath` field

**Rationale:**
- `filePath` is critical for duplicate detection (same file vs different files)
- Improves error messages by showing where identifiers were declared
- Required for the duplicate identifier validation logic
- `getFileCallerInfo()` is already available and used in identifiers
- Consistent across all provider types

**Benefits:**
- ✅ Better error messages with file attribution
- ✅ Enables duplicate detection with file path comparison
- ✅ Consistent API across all provider types
- ✅ Already implemented, no additional work needed

## 6. Error Handling Asymmetry: Schedule vs Binding

**Decision:** Schedule providers use fail-soft (best-effort), Binding providers use fail-fast.

**Rationale:**
- **Schedule (fail-soft):** All three timings (`after-bootstrap`, `on-listen`, `on-shutdown`) catch errors, log them, and continue without rethrowing. This is intentional because:
  - Scheduled tasks are often non-critical (cleanup, health checks, cache warming)
  - A failed schedule should not prevent the application from starting or running
  - Consistent with shutdown behavior where individual errors are logged but don't block other shutdown tasks
  - Best-effort approach allows the application to remain operational even if some schedules fail

- **Binding (fail-fast):** The `bind()` execution catches errors and rethrows as `BINDING_EXECUTION_FAILED`. This is intentional because:
  - Bindings represent infrastructure connections (databases, message queues, external services)
  - A failed infrastructure connection should prevent the application from starting
  - It's better to fail fast at bootstrap than to start with broken infrastructure
  - Allows operators to detect and fix infrastructure issues before serving traffic

**Trade-offs:**
- ✅ Schedule failures don't block application startup
- ✅ Binding failures prevent starting with broken infrastructure
- ✅ Clear distinction between critical (infrastructure) and non-critical (scheduled tasks) failures
- ✅ Consistent behavior across all Schedule timings
- ❌ Asymmetry between channels requires understanding the intent behind each

**Implementation:**
- Schedule: try/catch with `log.error()`, no rethrow (lines 177-184, 197-204 in createApp.ts)
- Binding: try/catch with `throw new KerithError('BINDING_EXECUTION_FAILED', ...)` (lines 90-107 in createApp.ts)
- Middleware: try/catch with `throw new KerithError('MIDDLEWARE_RESOLUTION_FAILED', ...)` (lines 206-217, 259-297 in step-08-controllers.ts)

**Decision Update (Middleware):**
Originally, Middleware was fail-fast by implicit behavior (no try/catch). This was updated to explicit fail-fast with `MIDDLEWARE_RESOLUTION_FAILED` error code for consistency with Binding and better error attribution. The error wraps the underlying exception with the resolver name and file path, making it easier to debug misconfigured middleware (e.g., a Guard that throws during handler resolution).

## 7. Infrastructure Configuration: Environment Variables vs Core Options

**Decision:** Use environment variables read by adapters, not `CreateAppOptions` or reserved `Config()` names.

**Rationale:**
- **Not `CreateAppOptions.infrastructure`:** Would require Core to have typed fields like `redis`, violating agnostic design. Core should not know specific infrastructure vocabulary (Redis, BullMQ, etc.).
- **Not reserved `Config('redis', ...)`:** Mixes user-declared resources with internal adapter configuration. Developers would need to know that `'redis'` is a magic reserved string, conflating two distinct concepts.
- **Environment variables via adapter:** Zero new fields in Core or identifiers. The adapter owns its configuration scope (already handles `MISSING_PEER_DEPENDENCY`). Convention: `KERITH_REDIS_*` prefix, consistent with existing `KERITH_PROFILE`/`KERITH_LOG_FORMAT`.

**Trade-offs:**
- ✅ Zero new fields in Core or identifiers
- ✅ Adapter owns its configuration scope
- ✅ Consistent with existing KERITH_* conventions
- ✅ Reusable pattern for other adapters (Message, Stream, etc.)
- ❌ Requires environment variable configuration (standard practice, acceptable)

**Implementation:**
- `getRedisConnection()` in `adapters/bullmq.ts` reads `KERITH_REDIS_HOST`, `KERITH_REDIS_PORT`, `KERITH_REDIS_PASSWORD`
- Falls back to `localhost:6379` for development
- Validates port with `INVALID_ENV_CONFIG` error code (generic, reusable)
- `worker-executor.ts` calls `getRedisConnection()` inside `bind()` (not at import-time) to respect async env var loading (e.g., dotenv)

**Future Pattern for Message/Stream Transports:**
When the transport for `Message()`/`Stream()` is resolved (currently deferred), follow the same pattern:
- Implement `getXConnection()` in the respective adapter (e.g., `getKafkaConnection()`, `getRabbitMQConnection()`)
- Use consistent env var prefix (e.g., `KERITH_KAFKA_*`, `KERITH_RABBITMQ_*`)
- Reuse `INVALID_ENV_CONFIG` for validation errors
- Call the connection function inside `bind()`, not at import-time
- No changes to Core or identifiers - adapter owns its configuration

## Summary

All architectural decisions favor:
1. **Agnosticism**: Core remains framework and implementation agnostic
2. **Extensibility**: Third-party packages can extend without Core changes
3. **Simplicity**: Avoid unnecessary complexity for rare edge cases
4. **Flexibility**: Users can choose implementations that fit their needs
5. **Consistency**: Uniform patterns across provider types
6. **Fail-fast vs Fail-soft**: Critical infrastructure failures block startup, non-critical schedule failures don't
7. **Adapter-owned Configuration**: Infrastructure adapters read their own config via environment variables, keeping Core and identifiers agnostic

The Extension API is designed to be a stable foundation that `@kerith/app` and third-party packages can build upon without requiring Core changes.
