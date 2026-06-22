/**
 * @file bootstrap/context.ts
 *
 * Shared mutable context bag passed across every bootstrap step.
 *
 * Design rationale
 * ────────────────
 * Each step receives this object and fills in the fields it owns. Downstream
 * steps read from it. No step reassigns a field that a previous step already
 * populated — each field is written exactly once (its owner step) and read
 * zero-to-many times after that.
 *
 * `registry` is the only field that pre-exists before step-00: it is created
 * by `createApp()` before entering `registryContext.run()` and stays `readonly`
 * from that point forward. Every other field starts as `undefined` and becomes
 * defined as the pipeline progresses.
 *
 * Why `log` starts as `undefined`
 * ─────────────────────────────────
 * `log` is created at the end of step-01-config (line 132 of createApp.ts),
 * after `loadConfig()` resolves. step-00 does not emit any log messages today,
 * so `log?: Logger` is safe here. If a future step needs to log before step-01,
 * it should use `options.logger` directly or a no-op fallback — not create a
 * second Logger instance.
 *
 * Mutability
 * ──────────
 * Fields are intentionally mutable (no `readonly` on per-step fields). The
 * analysis of createApp.ts confirmed that no variable is reassigned outside its
 * originating block, so mutable fields here do not introduce new risk — they
 * simply reflect what the code already does.
 */

import type { Application } from "express";
import type {
  CreateAppOptions,
  MountedRoute,
  RegisteredModule,
} from "../types/index.js";
import type { Logger } from "../types/index.js";
import type { BootConfig } from "../core/config.js";
import type { PreloadConfig } from "../preload/index.js";
import type { InternalRegistry } from "../core/registry.js";
import type { ScanResult } from "./scanner.js";

// ─── Convenience alias for the resolved-module shape used inside the pipeline ──
// (scanModulesToResolved return type, inlined to avoid a scanner import cycle)
export interface ResolvedModule {
  name: string;
  dirPath: string;
  indexPath: string;
  domain?: string;
}

// ─── Main context ─────────────────────────────────────────────────────────────

export interface BootstrapContext {
  // ── Immutable — available before step-00 ─────────────────────────────────

  /** Absolute path to the project root (`process.cwd()` at bootstrap time). */
  readonly cwd: string;

  /** Express application, if provided. Absent when running in worker mode. */
  readonly app?: Application;

  /** Raw options passed to `createApp()`. */
  readonly options: CreateAppOptions;

  /**
   * Internal registry instance created by `createApp()` before
   * `registryContext.run()`. Passed `readonly` to prevent any step from
   * replacing the instance — mutation of its *contents* is fine and expected.
   */
  readonly registry: InternalRegistry;

  // ── Populated by step-01-config ──────────────────────────────────────────

  /** Fully resolved Kerith configuration (defaults applied). */
  config?: BootConfig;

  /**
   * Structured logger for use in all subsequent steps.
   * Undefined until step-01 completes (step-00 does not need logging).
   */
  log?: Logger;

  /** `true` when `.kerith/preload.js` is active in the current process. */
  preloaderActive?: boolean;

  /** Full preload config from `globalThis.__KERITH_PRELOAD_CONFIG__`, or `undefined`. */
  preloadConfig?: PreloadConfig;

  // ── Populated by step-02 (cache + scan) ──────────────────────────────────

  /** Filesystem scan result (from cache or fresh scan). Always defined after step-02. */
  scanResult?: ScanResult;

  /** Whether the scan result came fully or partially from the bootstrap cache. */
  usedCache?: boolean;

  /** Number of domains that were re-scanned (for partial cache hits). */
  numRescanned?: number;

  /** Human-readable reason for cache invalidation (shown in "Bootstrap complete" log). */
  cacheLogReason?: string;

  /** `true` when the entire scan was served from cache (zero domains rescanned). */
  isFullCacheHit?: boolean;

  /** Domain IDs that were rescanned in a partial cache hit. */
  rescannedDomains?: Set<string>;

  /** Whether the bootstrap cache is enabled for this run. */
  cacheEnabled?: boolean;

  /** Hash of the kerith.config.* file used to detect cache invalidation. */
  configHash?: string;

  /** `true` when using `origin` mode (v2 scanner) instead of `modules` glob. */
  isOriginMode?: boolean;

  /**
   * Flat list of resolved modules derived from `scanResult`.
   * Each entry carries `{ name, dirPath, indexPath, domain? }`.
   * Populated immediately after `scanModulesToResolved()` in step-02.
   */
  resolvedModules?: ResolvedModule[];

  // ── Populated by step-03 (entity registration + file prefetch) ───────────

  /**
   * All project source files matched by the global glob.
   * Reused by step-04 (NITS), step-07 (validations), and step-08 (controllers)
   * to avoid redundant `fg()` calls.
   */
  allProjectFiles?: string[];

  /**
   * Computed absolute path to the root directory where modules are located.
   */
  absoluteModulesRoot?: string;

  // ── Populated by step-04 (NITS reconciliation) ───────────────────────────

  /**
   * Map of absolute module directory path → list of source files belonging to
   * that module. Built once in step-04 and reused in step-07 and step-08.
   */
  filesByModulePath?: Map<string, string[]>;

  // ── Populated by step-06 (dynamic imports) ───────────────────────────────

  /**
   * All registered modules after dynamic imports have run.
   * `registry.getAllModules()` result cached here so downstream steps
   * don't call it repeatedly (O(n) each call).
   */
  allModules?: RegisteredModule[];

  // ── Populated by step-07 (validations) ───────────────────────────────────

  /**
   * Map of normalized module directory path → `{ name, domain? }`.
   * Built once in step-07 for O(1) path → module lookups inside
   * the import-scanning loop. Also used by step-08 controller discovery.
   */
  modulePathMap?: Map<string, { name: string; domain?: string }>;

  /**
   * Keys of `modulePathMap` sorted by length descending.
   * Required for the longest-prefix matching used in `groupFilesByModulePath`.
   */
  sortedModulePaths?: string[];

  // ── Populated by step-08 (controller discovery + mount) ──────────────────

  /** All routes mounted via `app.use()` during step-08. */
  mountedRoutes?: MountedRoute[];
}
