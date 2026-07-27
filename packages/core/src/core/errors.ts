export type KerithErrorCode =
  | "MODULE_NOT_FOUND"
  | "DUPLICATE_MODULE"
  | "DUPLICATE_DOMAIN"
  | "DUPLICATE_SUBMODULE"
  | "SUBMODULE_NESTED"
  | "ORIGIN_NOT_FOUND"
  | "PARENT_MODULE_NOT_FOUND"
  | "INVALID_DOMAIN_DECLARATION"
  | "INVALID_SUBMODULE_DECLARATION"
  | "MISSING_IMPORT"
  | "UNDECLARED_IMPORT"
  | "CIRCULAR_DEPENDENCY"
  | "EXPORT_MISMATCH"
  | "INVALID_CONTROLLER"
  | "ALIAS_NOT_FOUND"
  | "ALIAS_INVALID"
  | "ALIAS_CONFLICT"
  | "ALIAS_RESERVED"
  | "INVALID_ALIAS_KEY"
  | "DUPLICATE_ALIAS"
  | "DUPLICATE_BOOTSTRAP"
  | "REGISTRY_MISSING_CONTEXT"
  | "INVALID_MODULE_DECLARATION"
  | "RELATIVE_BOUNDARY_VIOLATION"
  | "MODULE_SPACE_CONFLICT"
  | "DUPLICATE_SERVICE"
  | "DUPLICATE_REPOSITORY"
  | "DUPLICATE_SCHEMA"
  | "INVALID_ESM_ENV"
  | "CLI_ERROR"
  | "UNUSED_IMPORT"
  | "PRELOADER_REQUIRED"
  | "PRELOADER_VERSION_MISMATCH"
  | "MODULE_LOAD_TIMEOUT"
  // ─── NITS structured logging codes (not thrown as exceptions) ─────────────
  /**
   * Emitted via structured log when the reconciler confirms that a stale module
   * is a real deletion (its shadow ID is absent from all discovered modules in
   * the current cycle). Used for observability only — never passed to `new KerithError()`.
   * @since v1.5.5
   */
  | "NITS_DELETE_CONFIRMED"
  // ─── Part 2 — Shared system violation codes ───────────────────────────────
  /**
   * Module imports `@shared` (or a subpath) without declaring it in `shared[]`.
   * @since v2.0.0
   */
  | "UNDECLARED_SHARED"
  /**
   * Module declares `@shared` in `shared[]` but no source file imports it.
   * @since v2.0.0 (detected via kerith check, not thrown at runtime)
   */
  | "UNUSED_SHARED"
  /**
   * Module from a foreign domain imports `@{domain}/shared`.
   * @since v2.0.0 (detected via kerith check, not thrown at runtime)
   */
  | "SHARED_SCOPE_VIOLATION"
  /**
   * A shared alias was placed in `imports[]` instead of `shared[]`.
   * @since v2.0.0
   */
  | "SHARED_IN_IMPORTS"
  /**
   * A module name was placed in `shared[]` instead of `imports[]`.
   * @since v2.0.0
   */
  | "MODULE_IN_SHARED"
  // ─── Extension API — identifier registration codes ────────────────────────
  /**
   * An identifier registered via `@kerith/identifiers` (or any third-party
   * extension) has an invalid name: empty string, non-string value, or a value
   * that does not match the allowed identifier name pattern.
   *
   * Hard error — thrown unconditionally regardless of `--strict` mode.
   * @since v2.0.0-alpha.1
   */
  | "INVALID_IDENTIFIER_NAME"
  /**
   * Two identifiers in the **Alias channel** (`Client`, `Config`, `Provider`,
   * `Store`, `Vault`, `Publisher`, `Tracer`, `Gateway`) were registered with
   * the same name inside the same module.
   * @since v2.0.0-alpha.1
   */
  | "DUPLICATE_ALIAS_IDENTIFIER"
  /**
   * Two identifiers in the **Middleware channel** (`Guard`, `RateLimit`,
   * `Firewall`, `Middleware`, `Interceptor`, `Pipe`, `Filter`, `Webhook`) were
   * registered with the same name inside the same module.
   * @since v2.0.0-alpha.1
   */
  | "DUPLICATE_MIDDLEWARE_IDENTIFIER"
  /**
   * Two identifiers in the **Schedule channel** (`Cron`, `Daemon`,
   * `HealthCheck`, `Probe`) were registered with the same name inside the same
   * module.
   * @since v2.0.0-alpha.1
   */
  | "DUPLICATE_SCHEDULE_IDENTIFIER"
  /**
   * Two identifiers in the **Binding channel** (`Worker`, `Processor`,
   * `Batch`, `Message`, `Subscriber`, `Saga`, `Choreography`, `SSE`,
   * `Metric`) were registered with the same name inside the same module.
   * @since v2.0.0-alpha.1
   */
  | "DUPLICATE_BINDING_IDENTIFIER"
  /**
   * Two extension providers (AliasProvider, MiddlewareResolver, ScheduleProvider,
   * or BindingProvider) were registered with the same name. Providers are global
   * and their names must be unique.
   * @since v2.0.0-alpha.1
   */
  | "DUPLICATE_EXTENSION_PROVIDER"
  /**
   * A peer dependency required by a `@kerith/app` adapter (e.g. `bullmq` for
   * queue support, `node-cron` for scheduling, `socket.io` for real-time,
   * `@opentelemetry/api` for tracing) is not installed in the user's project.
   *
   * The code lives in `@kerith/core` so that `KerithError` can carry it;
   * the error is always thrown by the adapter layer in `@kerith/app`.
   * @since v2.0.0-alpha.1
   */
  | "MISSING_PEER_DEPENDENCY"
  /**
   * A `Cron()` identifier was declared with a syntactically invalid cron
   * expression (wrong number of fields, illegal characters, out-of-range
   * values).
   *
   * The code lives in `@kerith/core` so that `KerithError` can carry it;
   * the error is thrown by the Cron executor in `@kerith/app` at bootstrap.
   * @since v2.0.0-alpha.1
   */
  | "INVALID_CRON_EXPRESSION"
  /**
   * A BindingProvider (e.g., Worker, Message, Subscriber) failed during
   * its `bind()` execution. This is a fail-fast error that aborts the
   * bootstrap process to prevent the application from running with a
   * critical integration (e.g., queue, database) in a broken state.
   *
   * The error wraps the underlying engine error (BullMQ, Redis, etc.)
   * with the provider name for clear attribution.
   * @since v2.0.0-alpha.1
   */
  | "BINDING_EXECUTION_FAILED"
  /**
   * A MiddlewareResolver (e.g., Guard, RateLimit, Middleware) failed during
   * its `getHandlers()` execution during controller mounting. This is a fail-fast
   * error that aborts the bootstrap process to prevent the application from
   * running with a misconfigured middleware (e.g., a guard that throws during
   * handler resolution).
   *
   * The error wraps the underlying error with the resolver name and file path
   * for clear attribution.
   * @since v2.0.0-alpha.1
   */
  | "MIDDLEWARE_RESOLUTION_FAILED"
  /**
   * An environment variable required by an adapter (e.g., Redis connection
   * settings for BullMQ) has an invalid value. This is a configuration error
   * that prevents the application from starting with a malformed environment.
   *
   * The error message includes the variable name and the invalid value received.
   * @since v2.0.0-alpha.1
   */
  | "INVALID_ENV_CONFIG";

export class KerithError extends Error {
  readonly code: KerithErrorCode;
  readonly details?: string;

  constructor(code: KerithErrorCode, message: string, details?: string) {
    super(message);
    this.name = "KerithError";
    this.code = code;
    this.details = details;
  }
}

