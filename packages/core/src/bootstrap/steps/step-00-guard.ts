/**
 * @file bootstrap/steps/step-00-guard.ts
 *
 * Step 00 — Bootstrap precondition guards
 *
 * Runs BEFORE `registryContext.run()` — this is intentional.
 * These checks need no registry, no config, no logger: they validate the raw
 * environment that Kerith requires before any pipeline state is created.
 *
 * Guard 1 — Duplicate Bootstrap
 * ──────────────────────────────
 * If the same Express `app` instance is passed to `createApp()` more than once,
 * the second call throws `DUPLICATE_BOOTSTRAP`. The flag `__KerithBootstrapped`
 * is written on the app at the end of step-08 (after `app.use()` calls complete).
 *
 * Guard 2 — ESM Environment
 * ──────────────────────────
 * Kerith requires `"type": "module"` in the project's root `package.json`.
 * CommonJS projects are not supported. If this guard fails the process would
 * crash on the first alias resolution anyway — failing early with a clear message
 * is preferable.
 *
 * @throws {KerithError} DUPLICATE_BOOTSTRAP — same app instance used twice.
 * @throws {KerithError} INVALID_ESM_ENV     — project is not an ESM package.
 */

import fs from "node:fs";
import path from "node:path";
import type { Application } from "express";
import { KerithError } from "../../core/errors.js";

/**
 * Runs all precondition guards for `createApp()`.
 *
 * Returns normally when both guards pass.
 * Throws a `KerithError` on the first guard that fails.
 *
 * @param app - The Express application passed to `createApp()`, or `undefined`
 *              when running in worker mode (no HTTP server).
 */
export function runGuard(app: Application | undefined): void {
  // ── Guard 1 — Prevent Duplicate Bootstrap ──────────────────────────────────
  if (app && (app as any).__KerithBootstrapped) {
    throw new KerithError(
      "DUPLICATE_BOOTSTRAP",
      "createApp() was called more than once with the same Express instance.",
    );
  }

  // ── Guard 2 — ESM Environment Validation ──────────────────────────────────
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
}
