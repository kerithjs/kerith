import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LogHandler } from '../types/index.js';
import {
  type KerithConfig,
  type AliasMap,
  isValidAliasKey,
  RESERVED_ALIASES,
} from './kerith-config.types.js';
import { resolveQualityRules, type ResolvedQualityRules } from './rules.types.js';
import { KerithError } from '../core/errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Internal config with all aliases resolved to absolute paths.
 * Produced by `loadKerithConfig()` — consumed by the bootstrap pipeline.
 */
export interface ResolvedKerithConfig extends KerithConfig {
  /**
   * Aliases with their values resolved to absolute paths from `cwd`.
   * e.g. `@config` → `/abs/path/to/src/config`
   */
  resolvedAliases: Map<string, string>;
  /**
   * Resolved quality rules (defaults applied, boolean false to null for metrics).
   */
  resolvedRules: ResolvedQualityRules;
}

// ─── Config candidate search order ───────────────────────────────────────────

const CONFIG_CANDIDATES = [
  'kerith.config.ts',
  'kerith.config.js',
  'kerith.config.mjs',
] as const;

// ─── Main loader ──────────────────────────────────────────────────────────────

/**
 * Loads and validates `kerith.config.ts|js|mjs` from `cwd`.
 *
 * - If no config file is found, returns defaults with an empty alias map.
 * - Validates every alias key with `isValidAliasKey()` → throws `INVALID_ALIAS_KEY`.
 * - Rejects reserved aliases (`@modules`, `@shared`) → throws `ALIAS_RESERVED`.
 * - Emits a `warn` log for aliases whose target path does not exist on disk.
 */
export async function loadKerithConfig(
  cwd: string,
  log?: LogHandler,
): Promise<ResolvedKerithConfig> {
  const logger = log ?? (() => { /* noop */ });

  // ── 1. Locate config file ──────────────────────────────────────────────────
  let configPath: string | null = null;

  for (const candidate of CONFIG_CANDIDATES) {
    const full = path.join(cwd, candidate);
    if (fs.existsSync(full)) {
      configPath = full;
      break;
    }
  }

  // ── 2. Load or use empty defaults ─────────────────────────────────────────
  let fileConfig: KerithConfig = {};

  if (!configPath) {
    logger('debug', '[config] No kerith.config found, using defaults', { _module: 'config' });
  } else {
    try {
      const importUrl = pathToFileURL(configPath).href;
      const mod = await import(importUrl);
      fileConfig = mod.default ?? mod.config ?? mod;
    } catch (error: any) {
      if (configPath.endsWith('.ts') && error.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
        throw new Error(
          `[System] Found "${path.basename(configPath)}" but your environment cannot load raw TypeScript files.\n` +
          `  - In production: Run "npm run build" OR use kerith.config.js.\n` +
          `  - In development: Ensure you are running with a loader like "tsx" or "ts-node".`,
          { cause: error },
        );
      }
      throw new Error(
        `[System] Failed to parse config at "${configPath}": ${error.message}`,
        { cause: error },
      );
    }
  }

  // ── 2.5 Validations ────────────────────────────────────────────────────────
  if (fileConfig.rules?.moduleLoadTimeout !== undefined && fileConfig.rules.moduleLoadTimeout !== false) {
    if (typeof fileConfig.rules.moduleLoadTimeout !== 'number' || fileConfig.rules.moduleLoadTimeout <= 0) {
      logger('warn', `[kerith] rules.moduleLoadTimeout must be a positive number. Using default: 30000ms.`, { _module: 'config' });
      fileConfig.rules.moduleLoadTimeout = 30000;
    }
  }

  if (fileConfig.logLevel !== undefined) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(fileConfig.logLevel)) {
      logger('warn', `[kerith] Invalid logLevel: "${fileConfig.logLevel}". Using 'info'.`, { _module: 'config' });
      fileConfig.logLevel = 'info';
    }
  }

  if (fileConfig.logFormat !== undefined) {
    const validFormats = ['json', 'pretty', 'auto'];
    if (!validFormats.includes(fileConfig.logFormat)) {
      logger('warn', `[kerith] Invalid logFormat: "${fileConfig.logFormat}". Using 'auto'.`, { _module: 'config' });
      fileConfig.logFormat = 'auto';
    }
  }

  // ── 3. Validate and resolve aliases ───────────────────────────────────────
  const rawAliases: AliasMap = fileConfig.aliases ?? {};
  const resolvedAliases = new Map<string, string>();

  for (const [key, value] of Object.entries(rawAliases)) {
    // 3a. Reserved alias check (takes priority over format validation)
    if ((RESERVED_ALIASES as readonly string[]).includes(key)) {
      throw new KerithError(
        'ALIAS_RESERVED',
        `[kerith] The alias "${key}" is reserved by Kerith and cannot be redefined in kerith.config.ts.`,
        key,
      );
    }

    // 3b. Key format validation
    if (!isValidAliasKey(key)) {
      throw new KerithError(
        'INVALID_ALIAS_KEY',
        `[kerith] The alias "${key}" is not a valid key. ` +
        `Keys must start with "@" followed by at least one letter (e.g. "@config", "@db"). ` +
        `Invalid alias detected in kerith.config.`,
        key,
      );
    }

    // 3c. Existence check (warn, don't throw)
    const absolutePath = path.resolve(cwd, value);
    if (!fs.existsSync(absolutePath)) {
      logger('warn', `[kerith] The alias "${key}" points to "${value}" but that path does not exist.`, {
        _module: 'config',
        alias: key,
        target: value,
        resolved: absolutePath,
      });
    }

    resolvedAliases.set(key, absolutePath);
  }

  const resolvedRules = resolveQualityRules(fileConfig?.rules, (fileConfig as any).moduleLoadTimeoutMs, logger);

  return {
    ...fileConfig,
    resolvedAliases,
    resolvedRules,
  };
}
