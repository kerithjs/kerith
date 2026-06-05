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
  // ─── Part 2 — Shared-scope violation codes ────────────────────────────────
  /**
   * A provider used inside a module was never registered in any `shared` array.
   * @since v2.0.0 (reserved — not yet thrown)
   */
  | "UNDECLARED_SHARED"
  /**
   * A provider was declared in a `shared` array but never consumed by any module.
   * @since v2.0.0 (reserved — not yet thrown)
   */
  | "UNUSED_SHARED"
  /**
   * A provider declared in `shared` is used outside its permitted scope.
   * @since v2.0.0 (reserved — not yet thrown)
   */
  | "SHARED_SCOPE_VIOLATION"
  /**
   * A provider appears in both `shared` and `imports` simultaneously, which is invalid.
   * @since v2.0.0 (reserved — not yet thrown)
   */
  | "SHARED_IN_IMPORTS"
  /**
   * A whole module reference was placed inside a `shared` array instead of `imports`.
   * @since v2.0.0 (reserved — not yet thrown)
   */
  | "MODULE_IN_SHARED";

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

