/**
 * @file bootstrap/steps/step-05b-virtual-aliases.ts
 *
 * Step 05b — Virtual Alias Hooks Registration + Static Table Population
 *
 * This step:
 *   1. Runs static alias discovery (`scanAliasDeclarations`) under `origin`
 *      and populates `runtime.table` with the resulting `key → filePath` map.
 *      This eliminates the Level-1 limitation that required the declaring file
 *      to have been imported before the alias was accessible.
 *   2. Registers Node.js ESM customization hooks (`resolve` + `load`) for the
 *      virtual alias channel (@config, @client, @store, @provider, @adapter).
 *
 * Step 05b must run strictly after step 05 (physical alias activation) to ensure
 * virtual alias hooks maintain top LIFO precedence, and strictly before
 * step 06 (dynamic imports) so modules can import alias channel instances.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerVirtualAliasHooks } from "../../aliases/virtual-hooks.js";
import { getAliasRuntime, normalizeCanonicalFileUrl } from "../../aliases/runtime.js";
import { scanAliasDeclarations, type AliasScanEntry } from "../alias-scan.js";
import {
  readAliasTableFile,
  isRuntimeDistMode,
  selectAliasTarget,
  resolveTsConfigOptions,
  computeDistPath,
  type CachedAliasEntry,
} from "../alias-table.js";
import { CacheManager } from "../../cache/bootstrap-cache.js";
import { KERITH_VERSION } from "../version.js";
import type { BootstrapContext } from "../context.js";

/**
 * Registers virtual alias hooks in the ESM loader and populates the static alias table.
 */
export async function runVirtualAliases(ctx: BootstrapContext): Promise<void> {
  // ── Static table population (Fase 3 / 7.1 & 7.2) ───────────────────────────
  // Discover alias declarations statically or load from generated alias-table.json
  // so the ESM hook can resolve @prefix/name imports even before the declaring
  // file has been evaluated.
  if (ctx.config?.resolveAliases !== false && ctx.cwd) {
    const originPath = ctx.config?.origin
      ? path.resolve(ctx.cwd, ctx.config.origin)
      : path.resolve(ctx.cwd, 'src');

    const isDist = isRuntimeDistMode(ctx.cwd);
    const tableFile = readAliasTableFile(ctx.cwd);

    try {
      if (tableFile && tableFile.version === KERITH_VERSION) {
        // ── 7.2 Tabla generada (direct hit) ──────────────────────────────────
        // If .kerith/alias-table.json exists and version matches, use directly without scanning
        const tableMap = new Map<string, string>();
        const scanEntries: AliasScanEntry[] = [];

        for (const [key, entry] of Object.entries(tableFile.entries)) {
          const target = selectAliasTarget(key, entry, isDist);
          tableMap.set(key, normalizeCanonicalFileUrl(target));

          const slashIdx = key.indexOf('/');
          const prefix = key.slice(0, slashIdx);
          const name = key.slice(slashIdx + 1);
          let mtimeMs: number | undefined;
          let size: number | undefined;
          try {
            const stats = fs.statSync(entry.src);
            mtimeMs = stats.mtimeMs;
            size = stats.size;
          } catch {
            // File might not exist or be accessible
          }

          scanEntries.push({
            prefix,
            name,
            key,
            filePath: pathToFileURL(entry.src).href,
            deps: entry.deps ?? [],
            mtimeMs,
            size,
          });
        }

        ctx.aliasScanEntries = scanEntries;
        if (tableMap.size > 0) {
          getAliasRuntime().setTable(tableMap);
        }
      } else {
        // ── Fallback ──────────────────────────────────────────────────────────
        const tsOptions = resolveTsConfigOptions(ctx.cwd);
        const warnCallback = ctx.log
          ? (msg: string) => ctx.log!.warn(msg, { _module: 'alias' })
          : (msg: string) => console.warn(`[Kerith] ${msg}`);

        if (process.env.NODE_ENV === 'production') {
          // Rule in architecture.md §5: production always does a full scan when there is no alias-table.json
          const warnMsg =
            '[alias-scan] .kerith/alias-table.json not found or version mismatch; falling back to full static scan in production. Run "kerith build" to generate it.';
          if (ctx.log) {
            ctx.log.warn(warnMsg, { _module: 'alias' });
          } else {
            console.warn(warnMsg);
          }

          const scan = await scanAliasDeclarations({
            originPath,
            warn: warnCallback,
          });
          ctx.aliasScanEntries = scan.entries;

          const tableMap = new Map<string, string>();
          for (const entry of scan.entries) {
            const srcAbs = entry.filePath.startsWith('file://')
              ? fileURLToPath(entry.filePath)
              : path.resolve(entry.filePath);
            const distAbs = tsOptions.outDir
              ? computeDistPath(srcAbs, tsOptions.outDir, tsOptions.rootDir, originPath, ctx.cwd)
              : undefined;

            const target = selectAliasTarget(entry.key, { src: srcAbs, dist: distAbs }, isDist);
            tableMap.set(entry.key, normalizeCanonicalFileUrl(target));
          }
          if (tableMap.size > 0) {
            getAliasRuntime().setTable(tableMap);
          }
        } else {
          // Development mode: incremental scan using cache if valid
          const isCacheValid =
            ctx.cacheEnabled &&
            ctx.rawCache &&
            CacheManager.valid(ctx.rawCache, KERITH_VERSION, ctx.configHash ?? '');

          const cachedAliases = isCacheValid
            ? (ctx.rawCache!.data?.aliases as CachedAliasEntry[] | undefined)
            : undefined;

          const scan = await scanAliasDeclarations({
            originPath,
            cachedAliases,
            warn: warnCallback,
          });
          ctx.aliasScanEntries = scan.entries;

          const tableMap = new Map<string, string>();
          for (const entry of scan.entries) {
            const srcAbs = entry.filePath.startsWith('file://')
              ? fileURLToPath(entry.filePath)
              : path.resolve(entry.filePath);
            const distAbs = tsOptions.outDir
              ? computeDistPath(srcAbs, tsOptions.outDir, tsOptions.rootDir, originPath, ctx.cwd)
              : undefined;

            const target = selectAliasTarget(entry.key, { src: srcAbs, dist: distAbs }, isDist);
            tableMap.set(entry.key, normalizeCanonicalFileUrl(target));
          }
          if (tableMap.size > 0) {
            getAliasRuntime().setTable(tableMap);
          }
        }
      }
    } catch (err: unknown) {
      // Errors that indicate broken app design abort bootstrap (design contract).
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : undefined;
      if (
        code === 'ALIAS_CIRCULAR' ||
        code === 'DUPLICATE_ALIAS_IDENTIFIER' ||
        code === 'DUPLICATE_EXTENSION_PROVIDER' ||
        code === 'ALIAS_INVALID' ||
        code === 'ALIAS_NOT_FOUND'
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (ctx.log) {
        ctx.log.warn(`[alias-scan] Static alias scan failed: ${msg}`, { _module: 'alias' });
      } else {
        console.warn(`[alias-scan] Static alias scan failed: ${msg}`);
      }
    }
  }

  // ── Virtual alias hooks registration ────────────────────────────────────────
  registerVirtualAliasHooks({ resolveAliases: ctx.config?.resolveAliases });
}

