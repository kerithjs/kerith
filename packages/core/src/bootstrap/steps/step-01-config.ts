/**
 * @file bootstrap/steps/step-01-config.ts
 *
 * Step 01 — Configuration and Logger Initialization
 *
 * Loads the user's `kerith.config.ts`, merges it with `createApp(options)`,
 * and establishes the central logger instance. It also determines if the
 * Kerith pre-loader is active for this process.
 *
 * This step defines the primary `log` and `config` variables that all subsequent
 * steps depend on.
 */

import { loadConfig } from "../../core/config.js";
import { KerithError } from "../../core/errors.js";
import { createLogger, defaultLogHandler } from "../../core/logger.js";
import {
  setPinoInstance,
  createDefaultPinoInstance,
} from "../../core/pino-instance.js";
import type { BootstrapContext } from "../context.js";

/**
 * Loads the config and initializes the global logger.
 * Populates `config`, `log`, `preloadConfig`, and `preloaderActive` in the context.
 */
export async function runConfigLoad(ctx: BootstrapContext): Promise<void> {
  const preloadConfig = globalThis.__KERITH_PRELOAD_CONFIG__;
  const preloaderActive = preloadConfig?.preloaded === true;

  const config = await loadConfig(ctx.options);

  if (config.requirePreloader === true && !preloaderActive) {
    throw new KerithError(
      "PRELOADER_REQUIRED",
      "The application requires the Kerith pre-loader to be active.",
      'Run the application with "node --import ./.kerith/preload.js" or set requirePreloader: false in kerith.config.ts.',
    );
  }

  if (config.logger === defaultLogHandler) {
    setPinoInstance(
      createDefaultPinoInstance(config.logFormat, config.logLevel),
    );
  }
  const log = createLogger(config.logger, config.logLevel, "boot");

  // Mutate context to expose to downstream steps
  ctx.preloadConfig = preloadConfig;
  ctx.preloaderActive = preloaderActive;
  ctx.config = config;
  ctx.log = log;
}
