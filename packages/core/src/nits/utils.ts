import path from 'node:path';
import { normalizePath } from '../core/utils/paths.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AliasScanEntry {
  name: string;
  dirPath: string;
  domain?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `childPath` is located inside `parentDir`.
 */
function isUnder(parentDir: string, childPath: string): boolean {
  const parent = normalizePath(path.resolve(parentDir));
  const child = normalizePath(path.resolve(childPath));
  return child === parent || child.startsWith(parent + '/');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calculates the canonical alias for a given module directory path.
 *
 * When `scanEntries` are provided (origin mode), the function resolves the
 * alias by longest-prefix match against the known module/domain paths:
 *   - Domain module  → `@<domain>/<name>`
 *   - Plain module   → `@modules/<name>`
 *
 * Without `scanEntries` (legacy modules-glob mode), the function falls back
 * to the classic segment-search heuristic:
 *   - `domains/<domain>/modules/<name>` → `@<domain>/<name>`
 *   - `modules/<name>`                 → `@modules/<name>`
 *   - Fallback                         → `@modules/<basename>`
 *
 * @param filePath    - Absolute or relative path to the module directory.
 * @param scanEntries - Optional resolved module entries from the scanner
 *                      (origin mode only). Each entry carries `name`,
 *                      `dirPath`, and an optional `domain`.
 */
export function calculateAlias(
  filePath: string,
  scanEntries?: AliasScanEntry[],
): string {
  // ── Origin mode: match against known scan entries ────────────────────────
  if (scanEntries && scanEntries.length > 0) {
    // Sort longest dirPath first for best-match semantics
    const sorted = [...scanEntries].sort(
      (a, b) => b.dirPath.length - a.dirPath.length,
    );

    for (const entry of sorted) {
      if (isUnder(entry.dirPath, filePath)) {
        return entry.domain
          ? `@${entry.domain}/${entry.name}`
          : `@modules/${entry.name}`;
      }
    }

    // No match found — fall through to legacy heuristic
  }

  // ── Legacy mode: segment-based heuristic ─────────────────────────────────
  const parts = filePath.split(/[\\/]/);

  // domains/<domain>/modules/<name>
  const domainsIdx = parts.indexOf('domains');
  if (
    domainsIdx !== -1 &&
    parts.length > domainsIdx + 3 &&
    parts[domainsIdx + 2] === 'modules'
  ) {
    const domain = parts[domainsIdx + 1];
    const name = parts[domainsIdx + 3];
    return `@${domain}/${name}`;
  }

  // modules/<name>
  const modulesIdx = parts.indexOf('modules');
  if (modulesIdx !== -1 && parts.length > modulesIdx + 1) {
    const name = parts[modulesIdx + 1];
    return `@modules/${name}`;
  }

  // Fallback
  return `@modules/${path.basename(filePath)}`;
}
