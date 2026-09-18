/**
 * pack-workspace-tarballs.js
 *
 * Packs the three Kerith workspace packages that generated projects depend on
 * (`@kerith/core`, `@kerith/app`, `@kerith/identifiers`) into `.tgz` files
 * inside an ephemeral temp directory, and returns a mapping of package name →
 * absolute tarball path.
 *
 * Design decisions:
 *  - Runs a single `pnpm pack` per package (never `npm pack`) so pnpm's
 *    workspace protocol is resolved correctly before packing.
 *  - The output directory includes a `runId` derived from the process start
 *    time so concurrent CI runs don't clobber each other.
 *  - The script is idempotent: if the tarballs for this runId already exist it
 *    returns early without re-packing (useful when the harness calls it from
 *    multiple test files).
 *  - stdout of this script is a single JSON line:
 *      { "@kerith/core": "/tmp/.../kerith-core-2.0.0-alpha.1.tgz", ... }
 *    so it can be consumed by callers with a simple JSON.parse(stdout).
 *
 * Usage (from a globalSetup or beforeAll):
 *   import { execSync } from 'node:child_process';
 *   import { fileURLToPath } from 'node:url';
 *   import { dirname, resolve } from 'node:path';
 *
 *   const __dirname = dirname(fileURLToPath(import.meta.url));
 *   const raw = execSync(`node ${resolve(__dirname, 'pack-workspace-tarballs.js')}`, {
 *     encoding: 'utf8',
 *     cwd: resolve(__dirname, '../../../'), // monorepo root
 *   });
 *   const tarballs = JSON.parse(raw); // { '@kerith/core': '/tmp/...', ... }
 *
 * The tarballs map is then used in generated projects' package.json overrides
 * (via `file:` protocol) so `npm install` resolves them without hitting the
 * public registry.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Locate monorepo root and the three packages to pack
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = path.resolve(__dirname, '../../../');

/** Packages to pack in dependency order (core first, then its dependents). */
const PACKAGES_TO_PACK = [
  { name: '@kerith/core',        dir: path.join(MONOREPO_ROOT, 'packages/core') },
  { name: '@kerith/app',         dir: path.join(MONOREPO_ROOT, 'packages/app') },
  { name: '@kerith/identifiers', dir: path.join(MONOREPO_ROOT, 'packages/identifiers') },
];

// ---------------------------------------------------------------------------
// Ephemeral output directory
// ---------------------------------------------------------------------------

/**
 * A stable run-ID derived from the process start time, truncated to the
 * nearest minute so re-runs within the same CI job reuse the same directory.
 */
const runId = Math.floor(Date.now() / 60_000).toString(36);
const TARBALLS_DIR = path.join(os.tmpdir(), `kerith-e2e-tarballs-${runId}`);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Packs all workspace packages and returns a map of package name → tarball path.
 *
 * @returns {Record<string, string>} e.g. { '@kerith/core': '/tmp/.../foo.tgz' }
 */
function packWorkspaceTarballs() {
  fs.mkdirSync(TARBALLS_DIR, { recursive: true });

  /** @type {Record<string, string>} */
  const result = {};

  for (const pkg of PACKAGES_TO_PACK) {
    // Check that dist/ exists — packing before building produces an empty tarball.
    const distDir = path.join(pkg.dir, 'dist');
    if (!fs.existsSync(distDir)) {
      throw new Error(
        `[pack-workspace-tarballs] dist/ directory not found for ${pkg.name} at ${distDir}.\n` +
        `Run "pnpm build" in the monorepo root before calling this script.`
      );
    }

    // Run pnpm pack and capture the tarball filename written to stdout.
    let raw;
    try {
      raw = execSync('pnpm pack --pack-destination ' + JSON.stringify(TARBALLS_DIR), {
        cwd: pkg.dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(
        `[pack-workspace-tarballs] "pnpm pack" failed for ${pkg.name}:\n${err.message}`,
        { cause: err }
      );
    }

    // pnpm pack prints the tarball path on the last non-empty line of stdout.
    // When --pack-destination is an absolute path, pnpm prints the full path;
    // when it is relative it may print only the basename — resolve handles both.
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1];

    if (!lastLine || !lastLine.endsWith('.tgz')) {
      throw new Error(
        `[pack-workspace-tarballs] Unexpected output from "pnpm pack" for ${pkg.name}.\n` +
        `Expected last stdout line to be a .tgz path, got: ${JSON.stringify(lastLine)}\n` +
        `Full output:\n${raw}`
      );
    }

    // Resolve relative to TARBALLS_DIR in case pnpm emits just a basename.
    const tarballPath = path.isAbsolute(lastLine)
      ? lastLine
      : path.join(TARBALLS_DIR, lastLine);

    if (!fs.existsSync(tarballPath)) {
      throw new Error(
        `[pack-workspace-tarballs] Tarball not found at expected path: ${tarballPath}\n` +
        `pnpm pack reported filename: ${lastLine}`
      );
    }

    result[pkg.name] = tarballPath;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entry point — when run directly, emit a single JSON line to stdout.
// ---------------------------------------------------------------------------

try {
  const tarballs = packWorkspaceTarballs();
  process.stdout.write(JSON.stringify(tarballs) + '\n');
} catch (err) {
  process.stderr.write(err.message + '\n');
  process.exit(1);
}

export { packWorkspaceTarballs, TARBALLS_DIR };
