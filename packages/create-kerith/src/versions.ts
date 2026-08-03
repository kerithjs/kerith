/**
 * versions.ts
 *
 * Resolves the CURRENTLY INSTALLED versions of @kerith/* packages at
 * runtime so generated package.json files always pin the real version
 * rather than a hardcoded constant.
 *
 * Strategy:
 *  1. Use createRequire(import.meta.url).resolve(pkgName) to locate the
 *     package's main entry on disk.
 *  2. Walk up the directory tree from that resolved path until we find a
 *     package.json whose "name" field matches pkgName.
 *  3. Return its "version".
 *
 * Fallback is only a safety net — in a normal `npm install` flow all three
 * packages are direct dependencies and will always be resolvable.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KerithVersions {
  core: string;
  app: string;
  identifiers: string;
}

interface PackageJson {
  name?: string;
  version?: string;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Walks up the directory tree starting from `startDir` until it finds a
 * `package.json` whose `"name"` field matches `pkgName`.
 *
 * Returns the `"version"` string of that manifest, or `null` if not found
 * before reaching the filesystem root.
 */
export function findVersionInTree(
  startDir: string,
  pkgName: string,
): string | null {
  let current = startDir;

  while (true) {
    const candidate = join(current, 'package.json');

    try {
      const raw = readFileSync(candidate, 'utf8');
      const manifest = JSON.parse(raw) as PackageJson;

      if (manifest.name === pkgName && typeof manifest.version === 'string') {
        return manifest.version;
      }
    } catch {
      // no package.json here — keep walking up
    }

    const parent = dirname(current);

    // Reached the filesystem root — stop to avoid an infinite loop.
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

/**
 * Resolves the installed version of `pkgName` by:
 *  1. Asking Node's require resolution to locate the package's main file.
 *  2. Walking up from that file's directory to find the matching package.json.
 *
 * Returns `fallback` if resolution fails for any reason (package not found,
 * malformed manifest, etc.).
 *
 * @param pkgName  e.g. `"@kerith/core"`
 * @param fallback Floor version used only when resolution is impossible.
 */
export function getInstalledVersion(pkgName: string, fallback: string): string {
  try {
    const require = createRequire(import.meta.url);
    const resolvedMain = require.resolve(pkgName);
    const startDir = dirname(resolvedMain);
    const version = findVersionInTree(startDir, pkgName);
    return version ?? fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Compile-time floor versions — kept in sync with package.json dependencies.
// These are the fallbacks, NOT the source of truth at runtime.
// ---------------------------------------------------------------------------

const FALLBACK_VERSIONS: KerithVersions = {
  core: '2.0.0-alpha.1',
  app: '1.0.0-alpha.1',
  identifiers: '1.0.0-alpha.1',
};

// ---------------------------------------------------------------------------
// Resolved constants — evaluated once at module load time.
// ---------------------------------------------------------------------------

export const CORE_VERSION = getInstalledVersion(
  '@kerith/core',
  FALLBACK_VERSIONS.core,
);

export const APP_VERSION = getInstalledVersion(
  '@kerith/app',
  FALLBACK_VERSIONS.app,
);

export const IDENTIFIERS_VERSION = getInstalledVersion(
  '@kerith/identifiers',
  FALLBACK_VERSIONS.identifiers,
);
