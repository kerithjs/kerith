/**
 * @file bootstrap/alias-table.ts
 *
 * Fase 3 — Nivel 3 (7.2): Tabla generada y caché de bootstrap.
 *
 * - Genera `.kerith/alias-table.json` con `{ version, entries: { "<key>": { src, dist?, deps } } }`.
 * - Calcula `dist` a partir de `compilerOptions.outDir` de `tsconfig.json` (se omite si no hay `outDir`).
 * - Selección en runtime: `dist` si `NODE_ENV=production` o si el entrypoint está dentro de `dist/`;
 *   `src` en cualquier otro caso (tsx, desarrollo).
 * - Si se pide `dist` y la entrada no lo tiene, lanza `ALIAS_NOT_FOUND` con la causa.
 * - Soporte para lectura directa de la tabla generada (sin escaneo) cuando existe y su versión coincide.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { KERITH_VERSION } from './version.js';
import { KerithError } from '../core/errors.js';
import { scanAliasDeclarations, type AliasScanResult } from './alias-scan.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AliasTableFileEntry {
  /** Absolute canonical filesystem path of the source declaring file */
  src: string;
  /** Absolute filesystem path of the compiled output file (if outDir configured) */
  dist?: string;
  /** Keys of `@prefix/name` direct static dependencies */
  deps: string[];
}

export interface AliasTableFile {
  /** Kerith version that generated this file */
  version: string;
  /** Map of alias key (`"prefix/name"`) to file paths and dependencies */
  entries: Record<string, AliasTableFileEntry>;
}

export interface CachedAliasEntry {
  prefix: string;
  name: string;
  key: string;
  filePath: string;
  deps: string[];
  mtimeMs: number;
  size: number;
}

// ─── TsConfig OutDir Resolution ──────────────────────────────────────────────

export function resolveTsConfigOptions(cwd: string): { outDir?: string; rootDir?: string } {
  const tsconfigPath = path.resolve(cwd, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return {};
  }
  try {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (!configFile.error && configFile.config) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath),
      );
      return {
        outDir: parsed.options.outDir ? path.resolve(parsed.options.outDir) : undefined,
        rootDir: parsed.options.rootDir ? path.resolve(parsed.options.rootDir) : undefined,
      };
    }
  } catch {
    // If tsconfig parsing fails, fallback to simple regex / empty
  }
  return {};
}

/**
 * Computes the corresponding output `.js` path inside `outDir` for a given source file.
 */
export function computeDistPath(
  srcAbsPath: string,
  outDir: string,
  rootDir?: string,
  originPath?: string,
  cwd: string = process.cwd(),
): string {
  const normSrc = path.resolve(srcAbsPath);
  let rel: string;

  if (rootDir && normSrc.startsWith(path.resolve(rootDir))) {
    rel = path.relative(path.resolve(rootDir), normSrc);
  } else if (originPath && normSrc.startsWith(path.resolve(originPath))) {
    rel = path.relative(path.resolve(originPath), normSrc);
  } else {
    rel = path.relative(cwd, normSrc);
  }

  const ext = path.extname(rel);
  let targetExt = '.js';
  if (ext === '.mts') targetExt = '.mjs';
  else if (ext === '.cts') targetExt = '.cjs';

  const noExt = ext ? rel.slice(0, -ext.length) : rel;
  return path.resolve(outDir, `${noExt}${targetExt}`).replace(/\\/g, '/');
}

// ─── Table File Generation & I/O ─────────────────────────────────────────────

export function getAliasTablePath(cwd: string = process.cwd()): string {
  return path.join(cwd, '.kerith', 'alias-table.json');
}

export async function generateAliasTable(opts: {
  cwd?: string;
  originPath?: string;
  warn?: (msg: string) => void;
  scanResult?: AliasScanResult;
}): Promise<AliasTableFile> {
  const cwd = opts.cwd ?? process.cwd();
  const originPath = opts.originPath ?? path.resolve(cwd, 'src');

  const scan =
    opts.scanResult ??
    (await scanAliasDeclarations({
      originPath,
      warn: opts.warn,
    }));

  const tsOptions = resolveTsConfigOptions(cwd);
  const entries: Record<string, AliasTableFileEntry> = {};

  for (const entry of scan.entries) {
    const srcAbs = entry.filePath.startsWith('file://')
      ? fileURLToPath(entry.filePath)
      : path.resolve(entry.filePath);
    const normSrc = srcAbs.replace(/\\/g, '/');

    let distAbs: string | undefined;
    if (tsOptions.outDir) {
      distAbs = computeDistPath(normSrc, tsOptions.outDir, tsOptions.rootDir, originPath, cwd);
    }

    entries[entry.key] = {
      src: normSrc,
      ...(distAbs ? { dist: distAbs } : {}),
      deps: entry.deps,
    };
  }

  return {
    version: KERITH_VERSION,
    entries,
  };
}

export function writeAliasTableFile(cwd: string, tableFile: AliasTableFile): void {
  const kerithDir = path.join(cwd, '.kerith');
  if (!fs.existsSync(kerithDir)) {
    fs.mkdirSync(kerithDir, { recursive: true });
  }

  const filePath = getAliasTablePath(cwd);
  const tmpPath = path.join(kerithDir, 'alias-table.tmp');
  const content = JSON.stringify(tableFile, null, 2);

  fs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.copyFileSync(tmpPath, filePath);
    fs.unlinkSync(tmpPath);
  }
}

export function readAliasTableFile(cwd: string = process.cwd()): AliasTableFile | null {
  const filePath = getAliasTablePath(cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as AliasTableFile;
    if (parsed && typeof parsed === 'object' && parsed.version && parsed.entries) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Runtime Selection ────────────────────────────────────────────────────────

/**
 * Determines whether the runtime should resolve to `dist` or `src`.
 * Rules:
 *  - `dist` if `NODE_ENV=production`
 *  - `dist` if the entrypoint (`process.argv[1]`) is located inside `<cwd>/dist/`
 *  - `src` in any other case (development, tsx, test)
 */
export function isRuntimeDistMode(cwd: string): boolean {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  const entry = process.argv[1];
  if (entry) {
    const absEntry = path.resolve(entry).replace(/\\/g, '/');
    const tsOptions = resolveTsConfigOptions(cwd);
    const distDir = (tsOptions.outDir ?? path.resolve(cwd, 'dist')).replace(/\\/g, '/');
    const defaultDistDir = path.resolve(cwd, 'dist').replace(/\\/g, '/');
    if (
      absEntry.startsWith(distDir + '/') || absEntry === distDir ||
      absEntry.startsWith(defaultDistDir + '/') || absEntry === defaultDistDir
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Selects either `dist` or `src` path for a given alias entry.
 *
 * @throws `KerithError` with `ALIAS_NOT_FOUND` if `dist` is requested but the entry lacks it.
 */
export function selectAliasTarget(
  key: string,
  entry: { src: string; dist?: string },
  isDist: boolean,
): string {
  if (isDist) {
    if (!entry.dist) {
      throw new KerithError(
        'ALIAS_NOT_FOUND',
        `Alias "@${key}" has no compiled "dist" entry in alias table.`,
        `Production/dist mode requires compiled outputs, but no "dist" path was generated for this alias. Run "kerith build" or configure "compilerOptions.outDir" in tsconfig.json.`,
      );
    }
    return entry.dist;
  }
  return entry.src;
}

