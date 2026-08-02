import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * index.test.ts — Integration test
 *
 * Spawns the compiled bin (dist/index.js) with `--yes --no-install` inside a
 * real tmpdir and asserts that:
 *
 *   1. The process exits with code 0.
 *   2. Files land in  <tmpdir>/kerith-project/   (NOT in <tmpdir> itself).
 *   3. <tmpdir>/kerith-project/package.json exists and is valid JSON.
 *
 * REGRESSION guard for: "outDir '.' never joined with projectName"
 *   Old bug → files wrote to cwd (tmpdir).
 *   Fixed   → index.ts resolves outDir='.' as path.resolve(cwd, projectName).
 */

const BIN = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '../dist/index.js',
);
const PROJECT_NAME = 'kerith-project';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-integration-'));
});

afterAll(() => {
  // Clean up tmpdir after all tests finish.
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CLI end-to-end — outDir resolution', () => {
  it('dist/index.js must exist (build before running tests)', () => {
    expect(fs.existsSync(BIN), `bin not found at ${BIN}`).toBe(true);
  });

  it(
    'spawns with --yes --no-install and exits 0',
    () => {
      const result = spawnSync(
        process.execPath,       // node
        [BIN, PROJECT_NAME, '--yes', '--no-install'],
        {
          cwd: tmpDir,
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...process.env,
            // Disable colour / TTY tricks that could break output parsing
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
        },
      );

      if (result.status !== 0) {
        console.error('--- STDOUT ---\n', result.stdout);
        console.error('--- STDERR ---\n', result.stderr);
      }

      expect(result.status, 'process should exit with code 0').toBe(0);
    },
    35_000, // vitest timeout (ms)
  );

  it('files land in <tmpdir>/<projectName>/, not in <tmpdir> itself', () => {
    const projectDir = path.join(tmpDir, PROJECT_NAME);

    // Sub-folder must exist
    expect(
      fs.existsSync(projectDir),
      `Expected project folder at ${projectDir}`,
    ).toBe(true);

    // package.json must be inside the sub-folder
    const pkgJson = path.join(projectDir, 'package.json');
    expect(
      fs.existsSync(pkgJson),
      `Expected package.json at ${pkgJson}`,
    ).toBe(true);

    // package.json must be valid JSON
    const raw = fs.readFileSync(pkgJson, 'utf8');
    expect(() => JSON.parse(raw), 'package.json must be valid JSON').not.toThrow();
  });

  it('REGRESSION: package.json must NOT exist directly in cwd (old bug)', () => {
    const pkgJsonInCwd = path.join(tmpDir, 'package.json');
    expect(
      fs.existsSync(pkgJsonInCwd),
      'package.json must not be written to cwd — outDir bug not fixed',
    ).toBe(false);
  });
});
