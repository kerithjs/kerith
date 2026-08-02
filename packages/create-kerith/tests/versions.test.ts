import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs so we can control which package.json files exist on "disk"
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { findVersionInTree, getInstalledVersion } from '../src/versions.js';

const mockReadFileSync = vi.mocked(readFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a fake readFileSync that serves different package.json contents
 *  depending on the path requested.
 */
function buildFsMap(map: Record<string, object>) {
  return (filePath: unknown) => {
    const p = (filePath as string).replace(/\\/g, '/');
    if (p in map) return JSON.stringify(map[p]);
    const err: NodeJS.ErrnoException = new Error(`ENOENT: ${p}`);
    err.code = 'ENOENT';
    throw err;
  };
}

// ---------------------------------------------------------------------------
// findVersionInTree
// ---------------------------------------------------------------------------

describe('findVersionInTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns version when the first directory has the matching package.json', () => {
    mockReadFileSync.mockImplementation(
      buildFsMap({
        '/node_modules/@kerith/core/package.json': {
          name: '@kerith/core',
          version: '2.0.0-alpha.1',
        },
      }),
    );

    const result = findVersionInTree(
      '/node_modules/@kerith/core',
      '@kerith/core',
    );
    expect(result).toBe('2.0.0-alpha.1');
  });

  it('walks up and finds the correct package.json, not the first one encountered', () => {
    // Simulate a package whose main file resolves deep inside dist/
    // The dist/ directory does NOT have a package.json with the right name.
    mockReadFileSync.mockImplementation(
      buildFsMap({
        // Wrong package.json (different name) — should be skipped
        '/node_modules/@kerith/core/dist/package.json': {
          name: 'some-unrelated-package',
          version: '9.9.9',
        },
        // Correct package.json one level up
        '/node_modules/@kerith/core/package.json': {
          name: '@kerith/core',
          version: '2.0.0-alpha.1',
        },
      }),
    );

    const result = findVersionInTree(
      '/node_modules/@kerith/core/dist',
      '@kerith/core',
    );
    expect(result).toBe('2.0.0-alpha.1');
  });

  it('returns null when no matching package.json is found in the tree', () => {
    mockReadFileSync.mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });

    const result = findVersionInTree('/some/path', '@kerith/core');
    expect(result).toBeNull();
  });

  it('skips a package.json whose name does not match, even at the same level', () => {
    mockReadFileSync.mockImplementation(
      buildFsMap({
        '/node_modules/@kerith/core/package.json': {
          name: '@kerith/app', // wrong name
          version: '1.0.0',
        },
      }),
    );

    // Will not find a match → reaches filesystem root → null
    const result = findVersionInTree(
      '/node_modules/@kerith/core',
      '@kerith/core',
    );
    expect(result).toBeNull();
  });

  it('handles malformed JSON gracefully and continues walking up', () => {
    let calls = 0;
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const p = (filePath as string).replace(/\\/g, '/');
      calls++;
      if (p.endsWith('dist/package.json')) {
        return 'NOT JSON {{{';
      }
      if (p.endsWith('core/package.json')) {
        return JSON.stringify({ name: '@kerith/core', version: '2.0.0-alpha.1' });
      }
      const err: NodeJS.ErrnoException = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });

    const result = findVersionInTree(
      '/node_modules/@kerith/core/dist',
      '@kerith/core',
    );
    expect(result).toBe('2.0.0-alpha.1');
    expect(calls).toBeGreaterThan(1); // confirmed it walked up
  });
});

// ---------------------------------------------------------------------------
// getInstalledVersion
// ---------------------------------------------------------------------------

describe('getInstalledVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the fallback when require.resolve throws (package not installed)', () => {
    // We cannot easily mock createRequire in ESM, so we verify the contract
    // with a fake pkgName that will never resolve.
    const result = getInstalledVersion(
      '__this_package_does_not_exist__',
      '0.0.0-fallback',
    );
    expect(result).toBe('0.0.0-fallback');
  });
});
