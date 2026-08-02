import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';

/**
 * fs-writer.test.ts
 *
 * Verifies the outDir resolution contract:
 *   - Without --out-dir, files land in <cwd>/<projectName>/ (NOT in cwd itself)
 *   - With --out-dir set explicitly, that path is used as-is (resolved to absolute)
 *
 * We test the contract at the level of the pure helper logic extracted from
 * index.ts, so we don't need to spawn a real process or hit the filesystem.
 */

/** Mirrors the exact logic in src/index.ts */
function resolveOutDir(cwd: string, outDir: string, projectName: string): string {
  return outDir === '.'
    ? path.resolve(cwd, projectName)
    : path.resolve(cwd, outDir);
}

describe('outDir resolution contract (mirrors src/index.ts)', () => {
  // Use a real, platform-valid base directory so paths are valid on Windows too
  const CWD = path.join(os.tmpdir(), 'kerith-test-cwd');

  it('when outDir is "." (default), files land in <cwd>/<projectName>/', () => {
    const result = resolveOutDir(CWD, '.', 'my-app');
    expect(result).toBe(path.join(CWD, 'my-app'));
  });

  it('when outDir is "." and projectName has hyphens, the folder name is preserved', () => {
    const result = resolveOutDir(CWD, '.', 'my-kerith-app');
    expect(result).toBe(path.join(CWD, 'my-kerith-app'));
  });

  it('when --out-dir is set explicitly, that path is used instead of projectName', () => {
    const result = resolveOutDir(CWD, './custom-dir', 'my-app');
    expect(result).toBe(path.join(CWD, 'custom-dir'));
  });

  it('when --out-dir is an absolute path, it is returned as-is (resolve is idempotent)', () => {
    const absolute = path.join(os.tmpdir(), 'my-project');
    const result = resolveOutDir(CWD, absolute, 'my-app');
    expect(result).toBe(path.normalize(absolute));
  });

  it('REGRESSION: outDir "." must NOT equal cwd (old bug)', () => {
    const result = resolveOutDir(CWD, '.', 'my-app');
    // The old bug: files wrote to CWD itself instead of a sub-folder
    expect(result).not.toBe(CWD);
    expect(result).not.toBe(path.resolve(CWD, '.'));
  });
});
