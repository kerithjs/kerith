/**
 * @file bootstrap/steps/step-01b-setup.ts
 *
 * Step 01b — Setup & Pre-validation
 *
 * This step executes immediately after config load. It performs early
 * side-effects that do not depend on the module scan:
 * 1. Generates `tsconfig.kerith.json` for IDE support (in parallel).
 * 2. Emits warnings if the pre-loader is missing or mismatched.
 * 3. Validates that `config.origin` exists (if configured).
 * 4. Emits the initial "Bootstrap started" log.
 */

import fs from "node:fs";
import path from "node:path";
import { KerithError } from "../../core/errors.js";
import {
  writeTsconfigKerith,
  ensureTsconfigExtends,
} from "../../config/tsconfig-generator.js";
import type { BootstrapContext } from "../context.js";
import { KERITH_VERSION } from "../version.js";

/**
 * Executes the setup and pre-validation phase.
 *
 * @param ctx - The shared bootstrap context (must contain `config` and `log`).
 */
export async function runSetupPhase(ctx: BootstrapContext): Promise<void> {
  const { config, log, cwd, preloaderActive, preloadConfig } = ctx;

  if (!config || !log) {
    throw new Error("runSetupPhase requires config and log in context");
  }

  // ── 1. Generate tsconfig and register aliases (in parallel) ───────────────
  await Promise.all([
    writeTsconfigKerith(config, cwd, log),
    ensureTsconfigExtends(cwd, log),
  ]);

  log.debug(
    `[bootstrap] Aliases registrados: ${[...config.resolvedAliases.keys()].join(", ")}`,
    { _module: "alias" },
  );

  // ── 2. Pre-loader Warnings ────────────────────────────────────────────────
  if (!preloaderActive && config.resolveAliases !== false) {
    log.warn(
      "Pre-loader not detected. Alias resolution might fail for top-level imports. Running in legacy mode (v1.4.0).",
      {
        suggestion:
          'Run "npx kerith sync-preload" and use "node --import ./.kerith/preload.js"',
      },
    );
  }

  if (preloaderActive) {
    if (preloadConfig?._version && preloadConfig._version !== KERITH_VERSION) {
      log.warn(
        `Pre-loader version mismatch: preload.js was generated with v${preloadConfig._version} but Kerith-core v${KERITH_VERSION} is installed. Run: kerith sync-preload`,
      );
    }
  }

  // ── 3. Origin Validation ──────────────────────────────────────────────────
  if (config.origin) {
    const originAbsolutePath = path.resolve(cwd, config.origin);
    if (!fs.existsSync(originAbsolutePath)) {
      throw new KerithError(
        "ORIGIN_NOT_FOUND",
        `origin '${config.origin}' not found. Set origin in kerith.config.js`,
      );
    }
  }

  // ── 4. Initial Log ────────────────────────────────────────────────────────
  log.info("Bootstrap started", {
    origin: config.origin ?? "(none)",
    modules: config.modules,
    prefix: config.prefix || "(none)",
    strict: config.strict,
    nodeVersion: process.version,
  });
}
