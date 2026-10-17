/**
 * @file bootstrap/steps/step-00-guard.ts
 *
 * Step 00 — Bootstrap precondition guards
 *
 * Runs BEFORE `registryContext.run()` — this is intentional.
 * These checks need no registry, no config, no logger: they validate the raw
 * environment that Kerith requires before any pipeline state is created.
 *
 * ## Bootstrap state machine
 *
 * The module tracks a process-level state to enforce the one-app-per-process
 * rule (ADR-006 C):
 *
 *   idle ──► booting ──► booted
 *     ▲          │
 *     └──────────┘  (releaseBootstrap — on failure)
 *
 * - `idle`    — no active or completed bootstrap.
 * - `booting` — `runGuard` passed; bootstrap pipeline is running.
 * - `booted`  — bootstrap completed successfully (`markBootstrapped` called).
 *
 * ## Guards (in order)
 *
 * Guard 1 — Duplicate instance
 * ─────────────────────────────
 * If the same Express `app` instance is passed to `createApp()` more than once,
 * the second call throws `DUPLICATE_BOOTSTRAP`. The flag `__KerithBootstrapped`
 * is written on the app at the end of step-08 (after `app.use()` calls complete).
 *
 * Guard 2 — Process-level guard
 * ──────────────────────────────
 * If the process-level state is not `idle` (i.e. another `createApp()` is in
 * progress or already completed), the call throws `DUPLICATE_BOOTSTRAP` with a
 * distinct message: "createApp() was called more than once in the same process."
 *
 * Guard 3 — ESM Environment
 * ──────────────────────────
 * Kerith requires `"type": "module"` in the project's root `package.json`.
 * CommonJS projects are not supported. If this guard fails the process would
 * crash on the first alias resolution anyway — failing early with a clear message
 * is preferable.
 *
 * @throws {KerithError} DUPLICATE_BOOTSTRAP — same app instance used twice, or
 *                                             createApp() called more than once.
 * @throws {KerithError} INVALID_ESM_ENV     — project is not an ESM package.
 */

import fs from "node:fs";
import path from "node:path";
import type { Application } from "express";
import { KerithError } from "../../core/errors.js";

// ── Bootstrap state machine ─────────────────────────────────────────────────

type BootstrapState = "idle" | "booting" | "booted";
let bootstrapState: BootstrapState = "idle";

/**
 * Transitions `booting → booted`.
 * Called by `createApp` just before returning the `KerithApp` object.
 */
export function markBootstrapped(): void {
  if (bootstrapState === "booting") {
    bootstrapState = "booted";
  }
}

/**
 * Transitions `booting → idle`.
 * Called by `createApp` in its `catch` block so that a failed bootstrap does
 * not permanently block a subsequent valid `createApp()` call.
 */
export function releaseBootstrap(): void {
  if (bootstrapState === "booting") {
    bootstrapState = "idle";
  }
}

/**
 * Resets the bootstrap state unconditionally to `idle`.
 *
 * @internal — for use in test teardown only (e.g. `resetGlobalState()`).
 */
export function resetBootstrapGuard(): void {
  bootstrapState = "idle";
}

// ── Guard ───────────────────────────────────────────────────────────────────

/**
 * Runs all precondition guards for `createApp()`.
 *
 * Returns normally when all guards pass; sets state to `booting`.
 * Throws a `KerithError` on the first guard that fails (state unchanged).
 *
 * @param app - The Express application passed to `createApp()`, or `undefined`
 *              when running in worker mode (no HTTP server).
 */
export function runGuard(app: Application | undefined): void {
  // ── Guard 1 — Prevent Duplicate Bootstrap (same instance) ──────────────────
  // Kept first so R10e continues to receive the original message.
  if (app && (app as any).__KerithBootstrapped) {
    throw new KerithError(
      "DUPLICATE_BOOTSTRAP",
      "createApp() was called more than once with the same Express instance.",
    );
  }

  // ── Guard 2 — Process-level singleton ──────────────────────────────────────
  // Covers: sequential calls, concurrent Promise.all, and worker-mode calls.
  // `createApp` is synchronous up to this point, so marking `booting` here
  // is race-free: Node's event loop cannot interleave two synchronous
  // executions between the check and the assignment below.
  if (bootstrapState !== "idle") {
    throw new KerithError(
      "DUPLICATE_BOOTSTRAP",
      "createApp() was called more than once in the same process. Kerith supports one app per process.",
    );
  }

  // ── Guard 3 — ESM Environment Validation ──────────────────────────────────
  let isEsm = false;
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.type === "module") {
        isEsm = true;
      }
    }
  } catch (_e) {
    // Failsafe — if package.json is unreadable, treat as non-ESM.
  }

  if (!isEsm) {
    throw new KerithError(
      "INVALID_ESM_ENV",
      'Kerith requires an ESM environment. Please ensure "type": "module" is present in your root package.json file.',
    );
  }

  // All guards passed — mark as booting.
  // A failure in any guard above leaves the state as `idle` so the caller
  // does not need to call releaseBootstrap().
  bootstrapState = "booting";
}
