import * as fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import type { LogHandler } from '../../types/index.js';
import type { KerithConfig } from '../../config/kerith-config.types.js';
import type { KerithRegistry } from '../../types/index.js';
import { normalizePath } from '../../core/utils/paths.js';

export interface ImportFound {
  specifier: string;
  line: number;
  file: string;
}

const IMPORT_REGEX =
  /(?:import|export)(?:\s+type\s+)?(?:\s+|\s*\()(?:[^"';]+\s+from\s+)?['"]([^"';]+)['"]/g;

const RELATIVE_IMPORT_REGEX =
  /(?:import|export)(?:\s+type\s+)?(?:\s+|\s*\()(?:[^"';]+\s+from\s+)?['"](\.\.?\/[^"';]+)['"]/g;

/**
 * Strips comments from source code while preserving line count.
 *
 * Uses a state machine to handle:
 *   - `//` line comments
 *   - `/* ... *\/` block comments (including multi-line JSDoc)
 *   - single-quoted, double-quoted, and template-literal strings
 *     (so `'http://x'` or `'**\/*.ts'` never trigger false comment stripping)
 *   - escape sequences inside strings (`\'`, `\"`, `` \` ``)
 *
 * Each comment character is replaced with a space, **except `\n`**, so that
 * line-number calculations derived from `code.split('\n')` remain accurate.
 *
 * Known limitation: regex literals are not tracked. An AST-based
 * stripper (B7) is the definitive fix for that edge case.
 */
export function stripComments(code: string): string {
  type State =
    | 'code'
    | 'lineComment'
    | 'blockComment'
    | 'singleStr'
    | 'doubleStr'
    | 'templateStr';

  let state: State = 'code';
  const out = code.split('');
  const len = code.length;

  for (let i = 0; i < len; i++) {
    const ch = code[i];
    const next = code[i + 1];

    switch (state) {
      case 'code':
        if (ch === '/' && next === '/') {
          state = 'lineComment';
          out[i] = ' ';
        } else if (ch === '/' && next === '*') {
          state = 'blockComment';
          out[i] = ' ';
        } else if (ch === "'") {
          state = 'singleStr';
        } else if (ch === '"') {
          state = 'doubleStr';
        } else if (ch === '`') {
          state = 'templateStr';
        }
        break;

      case 'lineComment':
        if (ch === '\n') {
          state = 'code';
          // keep the newline so line numbers are preserved
        } else {
          out[i] = ' ';
        }
        break;

      case 'blockComment':
        if (ch === '*' && next === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i++; // skip '/'
          state = 'code';
        } else if (ch !== '\n') {
          out[i] = ' ';
        }
        break;

      case 'singleStr':
        if (ch === '\\') {
          i++; // skip escaped char
        } else if (ch === "'") {
          state = 'code';
        }
        break;

      case 'doubleStr':
        if (ch === '\\') {
          i++;
        } else if (ch === '"') {
          state = 'code';
        }
        break;

      case 'templateStr':
        if (ch === '\\') {
          i++;
        } else if (ch === '`') {
          state = 'code';
        }
        break;
    }
  }

  return out.join('');
}

/**
 * Shared regex scanner: runs the supplied regex over `code` and returns each
 * match's captured specifier together with its 1-based line number.
 *
 * Both sync and async parse paths call this helper so the logic lives in one place (H2).
 */
function extractSpecifiersFromCode(
  code: string,
  regex: RegExp,
): { specifier: string; line: number }[] {
  const results: { specifier: string; line: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    const specifier = match[1];
    const textBeforeMatch = code.substring(0, match.index);
    const line = textBeforeMatch.split('\n').length;
    results.push({ specifier, line });
  }

  return results;
}

const DEFAULT_ACTIVE_ALIASES = ['@modules'] as const;

function emitLog(log: LogHandler | undefined, level: 'warn' | 'debug', message: string): void {
  if (log) {
    log(level, message, { _module: 'import-scanner' });
    return;
  }
  if (level === 'warn') {
    console.warn(message);
  } else {
    console.debug(message);
  }
}

/**
 * Returns bare alias keys registered in the runtime (excludes `/*` wildcard entries).
 * Falls back to `@modules` when the registry has no aliases yet.
 */
export function getRegisteredAliases(registry: KerithRegistry): string[] {
  const keys = Object.keys(registry.getAllAliases()).filter(k => !k.endsWith('/*'));
  return keys.length > 0 ? keys : [...DEFAULT_ACTIVE_ALIASES];
}

/**
 * Builds the active-alias list for static analysis (CLI `check`) from config + discovered modules.
 * `@modules` covers every `@modules/<name>` subpath via prefix matching (REGLA-22).
 */
export function buildActiveAliasesFromConfig(
  config: KerithConfig,
  _moduleNames: string[] = [],
  domainNames: string[] = [],
): string[] {
  const aliases = new Set<string>(['@modules']);
  if (config.aliases) {
    for (const key of Object.keys(config.aliases)) {
      aliases.add(key);
    }
  }
  for (const domain of domainNames) {
    aliases.add(`@${domain}`);
  }
  return [...aliases];
}

function isKerithAlias(specifier: string, activeAliases: readonly string[]): boolean {
  if (!specifier.startsWith('@')) {
    return false;
  }
  return activeAliases.some(
    alias => specifier === alias || specifier.startsWith(`${alias}/`),
  );
}

function parseImportSpecifiers(
  filePath: string,
  log?: LogHandler,
): { specifier: string; line: number }[] | null {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const isJs =
      filePath.endsWith('.js') ||
      filePath.endsWith('.mjs') ||
      filePath.endsWith('.cjs');

    if (isJs) {
      try {
        acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'module',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        emitLog(log, 'warn', `[System] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
        emitLog(log, 'debug', `  Detail: ${message}`);
        return null;
      }
    }

    // Strip both line and block comments so imports inside JSDoc / commented-out
    // blocks are not reported as real imports (fixes BUG-10 / N-52).
    const strippedCode = stripComments(code);
    const regex = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);
    return extractSpecifiersFromCode(strippedCode, regex);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return null;
    }
    const message = err instanceof Error ? err.message : String(err);
    emitLog(log, 'warn', `[System] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
    emitLog(log, 'debug', `  Detail: ${message}`);
    return null;
  }
}

/**
 * REGLA-22: only include imports that match active Kerith aliases (inclusion list).
 * Relative cross-module imports are handled by `extractRelativeCrossModuleImports`.
 */
export function extractModuleImports(
  filePath: string,
  activeAliases: readonly string[] = DEFAULT_ACTIVE_ALIASES,
  log?: LogHandler,
): ImportFound[] {
  const parsed = parseImportSpecifiers(filePath, log);
  if (!parsed) return [];

  const imports: ImportFound[] = [];
  for (const { specifier, line } of parsed) {
    if (!isKerithAlias(specifier, activeAliases)) continue;
    imports.push({ specifier, line, file: filePath });
  }
  return imports;
}

async function parseImportSpecifiersAsync(
  filePath: string,
  log?: LogHandler,
): Promise<{ specifier: string; line: number }[] | null> {
  try {
    const code = await fs.promises.readFile(filePath, 'utf-8');
    const isJs =
      filePath.endsWith('.js') ||
      filePath.endsWith('.mjs') ||
      filePath.endsWith('.cjs');

    if (isJs) {
      try {
        acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'module',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        emitLog(log, 'warn', `[System] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
        emitLog(log, 'debug', `  Detail: ${message}`);
        return null;
      }
    }

    const strippedCode = stripComments(code);
    const regex = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);
    return extractSpecifiersFromCode(strippedCode, regex);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return null;
    }
    const message = err instanceof Error ? err.message : String(err);
    emitLog(log, 'warn', `[System] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
    emitLog(log, 'debug', `  Detail: ${message}`);
    return null;
  }
}

export async function extractModuleImportsAsync(
  filePath: string,
  activeAliases: readonly string[] = DEFAULT_ACTIVE_ALIASES,
  log?: LogHandler,
): Promise<ImportFound[]> {
  const parsed = await parseImportSpecifiersAsync(filePath, log);
  if (!parsed) return [];

  const imports: ImportFound[] = [];
  for (const { specifier, line } of parsed) {
    if (!isKerithAlias(specifier, activeAliases)) continue;
    imports.push({ specifier, line, file: filePath });
  }
  return imports;
}

/**
 * Scans a file for relative imports whose resolved target lies outside `moduleDirPath`.
 * Never throws — resolution errors yield an empty array and a debug log.
 */
export interface RelativeCrossModuleImport {
  specifier: string;
  line: number;
}

export function extractRelativeCrossModuleImports(
  filePath: string,
  moduleDirPath: string,
  log?: LogHandler,
): RelativeCrossModuleImport[] {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const moduleRoot = normalizePath(moduleDirPath);
    const fileDir = path.dirname(filePath);
    const crossModule: RelativeCrossModuleImport[] = [];

    // Strip both line and block comments (fixes M-10: the relative scanner had no stripping at all).
    const strippedCode = stripComments(code);
    const regex = new RegExp(RELATIVE_IMPORT_REGEX.source, RELATIVE_IMPORT_REGEX.flags);
    const specifiers = extractSpecifiersFromCode(strippedCode, regex);

    for (const { specifier, line } of specifiers) {
      try {
        const resolvedPath = normalizePath(path.resolve(fileDir, specifier));
        const isInside =
          resolvedPath === moduleRoot || resolvedPath.startsWith(`${moduleRoot}/`);

        if (!isInside) {
          crossModule.push({ specifier, line });
        }
      } catch (resolveErr: unknown) {
        const message = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
        log?.('debug', `[import-scanner] Could not resolve "${specifier}" in "${filePath}": ${message}`, {
          _module: 'import-scanner',
          file: filePath,
          specifier,
        });
      }
    }

    return crossModule;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return [];
    }
    const message = err instanceof Error ? err.message : String(err);
    log?.('debug', `[import-scanner] Failed to scan relative imports in "${filePath}": ${message}`, {
      _module: 'import-scanner',
      file: filePath,
    });
    return [];
  }
}
