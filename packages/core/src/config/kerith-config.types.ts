import type { LogLevel, LogFormat, NitsConfig } from '../types/index.js';

export interface AliasMap {
  [alias: string]: string;
}

export interface KerithConfig {
  /** @deprecated Replaced by \`origin\` in v2.0.0. Glob pointing to module folders. Default: 'src/modules/*'. */
  modules?: string;
  /** Root directory to scan for domains/modules (v2.0.0+). Default: 'src'. */
  origin?: string;
  /** Global route prefix. Example: '/api/v1'. Default: ''. */
  prefix?: string;
  /**
   * Enables circular dependency detection and undeclared import errors.
   * Default: true in development, false in production.
   */
  strict?: boolean;
  /**
   * If false, the runtime ESM alias hook is not activated.
   * Useful when the project resolves aliases via a bundler. Default: true.
   */
  resolveAliases?: boolean;
  /**
   * Minimum log level. Events below this level are not passed to the handler.
   * Default: 'info' (debug is off unless explicitly set).
   */
  logLevel?: LogLevel;
  /** Format of the output logs. Default: 'auto' */
  logFormat?: LogFormat;
  /** NITS (Native Identity Tracking System) configuration. */
  nits?: NitsConfig;
  /**
   * When `true`, `createApp()` throws `PRELOADER_REQUIRED` if the runtime pre-loader
   * is not active (i.e., the process was not started with `--import ./.kerith/preload.js`).
   *
   * Use this to enforce that top-level alias resolution is always available in
   * environments that require it (e.g. strict production deployments).
   *
   * @default false
   * @since v1.5.0
   */
  requirePreloader?: boolean;
  /**
   * Maximum time (in milliseconds) allowed for a module to load via dynamic import().
   * If the module exceeds this limit, a MODULE_LOAD_TIMEOUT error is thrown.
   * Helps prevent silent deadlocks from top-level await tasks (e.g. infinite DB connections).
   * @default 30000 (30 seconds)
   * @since v1.6.0
   */
  moduleLoadTimeoutMs?: number;
  /**
   * Alias configuration.
   */
  aliases?: AliasMap;
}

export function defineConfig(config: KerithConfig): KerithConfig {
  return config;
}

export function isValidAliasKey(key: string): boolean {
  if (key === '@modules' || key === '@shared' || key === '@') return false;
  return /^@[a-zA-Z][a-zA-Z0-9-]*$/.test(key);
}

export const RESERVED_ALIASES = ['@modules', '@shared'] as const;
