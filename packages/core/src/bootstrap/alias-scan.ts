/**
 * @file bootstrap/alias-scan.ts
 *
 * Fase 3 — Nivel 3 (7.1): Escaneo estático del canal alias.
 *
 * Enumera archivos bajo `origin` que declaran `Config()`, `Client()`,
 * `Store()`, `Provider()` o `Adapter()` importados desde `@kerith/app`
 * o `@kerith/identifiers`. Construye la tabla estática `key → filePath`
 * y el grafo de dependencias entre aliases para detectar ciclos.
 *
 * # Flujo
 *
 * 1. Glob: `**\/*.{config,client,store,provider,adapter}.{ts,js,mts,mjs}`
 *    bajo `origin`, excluyendo `node_modules`, `dist`, `.kerith` y archivos
 *    de test (`*.test.*`, `*.spec.*`). Pre-filtra por texto antes de parsear.
 * 2. Por cada archivo candidato: `extractMultipleIdentifierCalls` (`core/src/cli/lib/ast-parser.ts`)
 *    con `['Config','Client','Store','Provider','Adapter']` para extraer las llamadas,
 *    verificando que se importó de `@kerith/app` o `@kerith/identifiers`.
 * 3. Nombre no literal → `ALIAS_INVALID` con archivo y línea (D8).
 *    Imports renombrados (`import { Client as K }`) → `warn` (no soportados en v1).
 * 4. Grafo de dependencias: por cada archivo declarante, extrae sus imports
 *    estáticos con forma `@prefijo/nombre` presentes en la tabla. Detecta
 *    ciclos por DFS con pila. Ciclo → `ALIAS_CIRCULAR` con la cadena completa
 *    y los archivos declarantes.
 * 5. Duplicados → `DUPLICATE_EXTENSION_PROVIDER` si es en archivos distintos,
 *    `DUPLICATE_ALIAS_IDENTIFIER` si es en el mismo archivo.
 *
 * # Resultado
 *
 * `AliasScanResult.entries`: lista de `AliasScanEntry` con
 * `{ prefix, name, key, filePath, deps }`.
 * `AliasScanResult.table`: Map `key → filePath` listo para inyectar en el
 * runtime vía `runtime.setTable()`.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import { KerithError } from '../core/errors.js';
import { ALIAS_CHANNEL_PREFIXES } from '../aliases/virtual-hooks.js';
import { extractMultipleIdentifierCalls } from '../cli/lib/ast-parser.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/** One alias-channel declaration found in the codebase by static scan. */
export interface AliasScanEntry {
  /** e.g. `'config'`, `'client'`, `'store'`, `'provider'`, `'adapter'` */
  prefix: string;
  /** The literal string passed as the first arg, e.g. `'db'` */
  name: string;
  /** `"${prefix}/${name}"`, e.g. `'client/db'` */
  key: string;
  /** Absolute canonical file URL of the declaring file */
  filePath: string;
  /** Keys of `@prefix/name` imports detected as direct static deps of this alias's file */
  deps: string[];
}

export interface AliasScanResult {
  /** All discovered alias declarations. */
  entries: AliasScanEntry[];
  /** `key → canonical filePath` table, ready for `runtime.setTable()`. */
  table: Map<string, string>;
}

/** Callee names that map to alias-channel identifiers. */
export const ALIAS_CALLEE_NAMES = ['Config', 'Client', 'Store', 'Provider', 'Adapter'];

// ─── Cycle detection (DFS with stack) ────────────────────────────────────────

/**
 * DFS cycle detection.
 * Returns the cycle as an ordered list of keys (first = entry point, repeated
 * at the end), or `null` if there is no cycle.
 */
function detectCycle(
  startKey: string,
  depGraph: Map<string, string[]>,
): string[] | null {
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(key: string): string[] | null {
    if (stack.includes(key)) {
      const cycleStart = stack.indexOf(key);
      return [...stack.slice(cycleStart), key];
    }
    if (visited.has(key)) return null;
    visited.add(key);
    stack.push(key);
    for (const dep of depGraph.get(key) ?? []) {
      const result = dfs(dep);
      if (result) return result;
    }
    stack.pop();
    return null;
  }

  return dfs(startKey);
}

// ─── Extract static alias imports from file content ──────────────────────────

function extractStaticAliasImports(code: string): string[] {
  const aliasImports: string[] = [];
  const importRegex = /(?:from\s+|import\s*\()\s*['"]@([a-z]+)\/([a-z0-9_-]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(code)) !== null) {
    if (ALIAS_CHANNEL_PREFIXES.has(m[1])) {
      aliasImports.push(`${m[1]}/${m[2]}`);
    }
  }
  return aliasImports;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface AliasScanOptions {
  /** Absolute path to the `origin` directory (e.g. `<cwd>/src`). */
  originPath: string;
  /**
   * Optional warn callback for non-fatal issues (renamed imports, non-literal
   * names, undeclared callee). Defaults to `console.warn`.
   */
  warn?: (msg: string) => void;
  /**
   * Optional glob patterns for extra files to include beyond the convention-
   * based pattern. Relative to `originPath`.
   */
  extraGlobs?: string[];
}

/**
 * Scans `originPath` for alias-channel declarations and returns the static
 * table and dependency entries.
 *
 * @throws `KerithError` with `ALIAS_CIRCULAR` if a dependency cycle is found.
 * @throws `KerithError` with `DUPLICATE_EXTENSION_PROVIDER` if the same key
 *   is declared in two different files.
 * @throws `KerithError` with `DUPLICATE_ALIAS_IDENTIFIER` if the same key
 *   is declared more than once in the same file.
 * @throws `KerithError` with `ALIAS_INVALID` if an alias call has a non-literal name.
 */
export async function scanAliasDeclarations(opts: AliasScanOptions): Promise<AliasScanResult> {
  const { originPath, warn = (msg: string) => console.warn(`[Kerith] ${msg}`) } = opts;

  if (!fs.existsSync(originPath)) {
    return { entries: [], table: new Map() };
  }

  // ── 1. Glob ──────────────────────────────────────────────────────────────
  const globs = [
    '**/*.{config,client,store,provider,adapter}.{ts,js,mts,mjs}',
    ...(opts.extraGlobs ?? []),
  ];

  const files = fg.sync(globs, {
    cwd: originPath,
    absolute: true,
    onlyFiles: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.kerith/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.d.ts',
    ],
  });

  // ── 2. Parse each file ───────────────────────────────────────────────────
  const entries: AliasScanEntry[] = [];
  const table = new Map<string, string>();
  const depGraph = new Map<string, string[]>(); // key → dep keys
  const keyToFile = new Map<string, string>();  // for dup detection

  for (const absFile of files) {
    let code: string;
    try {
      code = fs.readFileSync(absFile, 'utf-8');
    } catch {
      continue;
    }

    // Pre-filter: skip files with no alias callee text at all (perf optimisation)
    if (!ALIAS_CALLEE_NAMES.some((n) => code.includes(n + '('))) continue;

    const canonicalUrl = pathToFileURL(absFile).href;

    // Use extractMultipleIdentifierCalls from ast-parser
    const calls = await extractMultipleIdentifierCalls(absFile, ALIAS_CALLEE_NAMES, {
      warn,
      strictLiteralName: true,
    });

    if (calls.length === 0) continue;

    for (const call of calls) {
      const prefix = call.prefix ?? call.type?.toLowerCase() ?? '';
      const key = `${prefix}/${call.name}`;

      // Duplicate check
      if (keyToFile.has(key)) {
        const existing = keyToFile.get(key)!;
        if (existing !== canonicalUrl) {
          throw new KerithError(
            'DUPLICATE_EXTENSION_PROVIDER',
            `Alias "@${key}" is declared in two different files:`,
            `  1. ${existing}\n  2. ${canonicalUrl}`,
          );
        } else {
          throw new KerithError(
            'DUPLICATE_ALIAS_IDENTIFIER',
            `Alias "@${key}" is declared more than once in ${canonicalUrl} (line ${call.line}).`,
          );
        }
      }

      keyToFile.set(key, canonicalUrl);
      table.set(key, canonicalUrl);
    }

    // Extract @prefix/name imports in this file for dependency graph
    const fileAliasImports = extractStaticAliasImports(code);

    for (const call of calls) {
      const prefix = call.prefix ?? call.type?.toLowerCase() ?? '';
      const key = `${prefix}/${call.name}`;
      if (!depGraph.has(key)) {
        depGraph.set(key, []);
      }
      for (const depSpec of fileAliasImports) {
        if (depSpec !== key) {
          depGraph.get(key)!.push(depSpec);
        }
      }
    }
  }

  // ── 3. Cycle detection ───────────────────────────────────────────────────
  const checked = new Set<string>();
  for (const key of table.keys()) {
    if (checked.has(key)) continue;
    const cycle = detectCycle(key, depGraph);
    if (cycle) {
      const chain = cycle.map((k) => `@${k}`).join(' → ');
      const files = cycle
        .map((k) => keyToFile.get(k))
        .filter(Boolean)
        .join('\n  ');
      throw new KerithError(
        'ALIAS_CIRCULAR',
        `Circular dependency detected between aliases: ${chain}`,
        `Declaring files:\n  ${files}`,
      );
    }
    checked.add(key);
  }

  // ── 4. Build entries ─────────────────────────────────────────────────────
  for (const [key, filePath] of table) {
    const slashIdx = key.indexOf('/');
    const prefix = key.slice(0, slashIdx);
    const name = key.slice(slashIdx + 1);
    const deps = (depGraph.get(key) ?? []).filter((d) => table.has(d));
    entries.push({ prefix, name, key, filePath, deps });
  }

  return { entries, table };
}
