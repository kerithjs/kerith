import path from 'node:path';
import { normalizePath } from './paths.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal domain entry shape needed for domain inference.
 * Matches `DomainScanEntry` from `bootstrap/scanner` but is declared here
 * independently to avoid a circular import.
 */
export interface DomainEntry {
  name: string;
  dirPath: string;
}

/**
 * Minimal module entry shape needed for parent-module inference.
 * Matches `ModuleScanEntry` from `bootstrap/scanner` but is declared here
 * independently to avoid a circular import.
 */
export interface ModuleEntry {
  name: string;
  dirPath: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPathUnder(parentDir: string, childPath: string): boolean {
  const parent = normalizePath(path.resolve(parentDir));
  const child = normalizePath(path.resolve(childPath));
  if (child === parent) return true;
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Infers which registered domain a file belongs to based on its path.
 *
 * Returns the name of the innermost domain whose `dirPath` is an ancestor of
 * `filePath`, or `undefined` if none matches.
 *
 * @param filePath - Absolute path of the file to classify.
 * @param domains  - Known domain entries (name + dirPath).
 */
export function inferDomain(
  filePath: string,
  domains: DomainEntry[],
): string | undefined {
  // Sort by longest dirPath first so the most specific domain wins
  const sorted = [...domains].sort((a, b) => b.dirPath.length - a.dirPath.length);
  for (const domain of sorted) {
    if (isPathUnder(domain.dirPath, filePath)) {
      return domain.name;
    }
  }
  return undefined;
}

/**
 * Infers the parent module of a sub-module by walking up its directory tree.
 *
 * The lookup skips an intermediate `submodules/` directory if present,
 * matching the sub-module directory convention used by the origin scanner.
 *
 * @param filePath - Absolute path of the sub-module's index file.
 * @param modules  - Known module entries (name + dirPath).
 */
export function inferParentModule(
  filePath: string,
  modules: ModuleEntry[],
): string | undefined {
  const subModuleDir = normalizePath(path.dirname(path.resolve(filePath)));
  let parentDir = normalizePath(path.dirname(subModuleDir));

  // Skip the conventional `submodules/` container directory
  if (path.basename(parentDir) === 'submodules') {
    parentDir = normalizePath(path.dirname(parentDir));
  }

  // Sort by longest dirPath first for most-specific match
  const sorted = [...modules].sort((a, b) => b.dirPath.length - a.dirPath.length);
  for (const mod of sorted) {
    const modDir = normalizePath(path.resolve(mod.dirPath));
    if (parentDir === modDir) {
      return mod.name;
    }
  }
  return undefined;
}
