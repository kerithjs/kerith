/**
 * Shape of the configuration object embedded in `.kerith/preload.js`
 * and stored in `globalThis.__KERITH_PRELOAD_CONFIG__` at runtime.
 *
 * @since v1.5.0
 */
export interface PreloadConfig {
  /** Absolute path to the resolved modules directory. */
  modulesDir: string;
  /** All aliases resolved to absolute paths at sync-preload time. */
  aliases: Record<string, string>;
  /** Always `true` — used as a type-safe discriminator. */
  preloaded: true;
  /** Version of `Kerith-core` that generated this file. Used for mismatch detection. */
  _version: string;
}

declare global {
  var __KERITH_PRELOAD_CONFIG__: PreloadConfig | undefined;
}

/**
 * Returns `true` if the Kerith runtime pre-loader is active for the current process.
 *
 * The pre-loader is active when the process was started with
 * `--import ./.kerith/preload.js`, which sets `globalThis.__KERITH_PRELOAD_CONFIG__`
 * before any application module is evaluated.
 *
 * @returns `true` when top-level alias resolution is available.
 * @since v1.5.0
 *
 * @example
 * if (!isPreloaderActive()) {
 *   console.warn('Run: npx kerith sync-preload');
 * }
 */
export function isPreloaderActive(): boolean {
  return globalThis.__KERITH_PRELOAD_CONFIG__?.preloaded === true;
}

/**
 * Returns the full pre-loader configuration embedded in `.kerith/preload.js`,
 * or `undefined` if the pre-loader is not active.
 *
 * @since v1.5.0
 */
export function getPreloadConfig(): PreloadConfig | undefined {
  return globalThis.__KERITH_PRELOAD_CONFIG__;
}
