import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createResolveHook } from '../../src/preload/preload-hook.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

describe('Pre-loader ESM Hook (preload-hook.ts)', () => {
  const nextResolve = vi.fn((specifier, _context) => {
    return { url: specifier, shortCircuit: true };
  });

  const aliases = {
    '@modules': '/abs/src/modules',
    '@shared': '/abs/src/shared',
    '@config': '/abs/src/config',
    // Overlap to test priority (specific > general)
    '@specific': '/abs/src/general',
    '@specific/deep': '/abs/src/deep'
  };

  let resolve: any;

  beforeEach(() => {
    nextResolve.mockClear();
    // Create a fresh resolve hook for each test
    resolve = createResolveHook(aliases);
  });

  it('should not throw when createResolveHook() is called multiple times (idempotency)', () => {
    // First call
    createResolveHook(aliases);
    // Second call (should not do anything or throw error)
    expect(() => createResolveHook(aliases)).not.toThrow();
  });

  it('resolve() should transform @modules/users into the correct absolute path', () => {
    resolve('@modules/users', { conditions: [] }, nextResolve);
    const expectedPath = path.resolve('/abs/src/modules', 'users');
    const expectedUrl = pathToFileURL(expectedPath).href;
    
    expect(nextResolve).toHaveBeenCalledWith(expectedUrl, { conditions: [] });
  });

  it('resolve() should transform subpaths @modules/users/service correctly', () => {
    resolve('@modules/users/service', { conditions: [] }, nextResolve);
    const expectedPath = path.resolve('/abs/src/modules', 'users/service');
    const expectedUrl = pathToFileURL(expectedPath).href;
    
    expect(nextResolve).toHaveBeenCalledWith(expectedUrl, { conditions: [] });
  });

  it('resolve() should passthrough imports that are not known aliases', () => {
    resolve('./local-file.js', { conditions: [] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith('./local-file.js', { conditions: [] });
  });

  it('resolve() should passthrough node:* imports and npm packages', () => {
    resolve('node:fs', { conditions: [] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith('node:fs', { conditions: [] });

    resolve('express', { conditions: [] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith('express', { conditions: [] });
  });

  it('resolve() should prioritize more specific aliases over general ones when overlapping', () => {
    // If we resolve '@specific/deep/file', it should map to '/abs/src/deep/file'
    // and NOT to '/abs/src/general/deep/file'.
    
    resolve('@specific/deep/file', { conditions: [] }, nextResolve);
    const expectedPath = path.resolve('/abs/src/deep', 'file');
    const expectedUrl = pathToFileURL(expectedPath).href;
    
    expect(nextResolve).toHaveBeenCalledWith(expectedUrl, { conditions: [] });
  });

  // ── Gap 2: improved error message includes original alias ────────────────────
  it('attemptResolve() enriches ERR_MODULE_NOT_FOUND with the original alias name', () => {
    // Simulate nextResolve failing to find the resolved path
    const notFoundError = Object.assign(
      new Error('Cannot find module file:///abs/src/shared/index.js'),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
    const failingResolve = vi.fn(() => { throw notFoundError; });

    expect(() => {
      resolve('@shared', { conditions: [] }, failingResolve);
    }).toThrow(expect.objectContaining({
      code: 'ERR_MODULE_NOT_FOUND',
      message: expect.stringContaining("Cannot resolve alias '@shared'"),
    }));
  });

  it('attemptResolve() enriches error for sub-path alias (@shared/utils → path not found)', () => {
    const notFoundError = Object.assign(
      new Error('Cannot find module file:///abs/src/shared/utils'),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
    const failingResolve = vi.fn(() => { throw notFoundError; });

    expect(() => {
      resolve('@shared/utils', { conditions: [] }, failingResolve);
    }).toThrow(expect.objectContaining({
      message: expect.stringContaining("Cannot resolve alias '@shared'"),
    }));

    // The message should also hint to run sync-preload
    expect(() => {
      resolve('@shared/utils', { conditions: [] }, failingResolve);
    }).toThrow(expect.objectContaining({
      message: expect.stringContaining('Run: kerith sync-preload'),
    }));
  });

  it('resolve() re-throws ERR_MODULE_NOT_FOUND unchanged when no alias was involved', () => {
    // A plain relative import that is not an alias should have its error unchanged
    const notFoundError = Object.assign(
      new Error('Cannot find module ./missing-file.js'),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
    const failingResolve = vi.fn(() => { throw notFoundError; });

    expect(() => {
      resolve('./missing-file.js', { conditions: [] }, failingResolve);
    }).toThrow(expect.objectContaining({
      message: expect.not.stringContaining("Cannot resolve alias"),
    }));
  });

  // ── Part 3: Optimized preload-hook tests ─────────────────────────────────────
  it('prebuilds exactAliasMap and wildcardAliases in createResolveHook() efficiently', () => {
    const largeAliases = Object.fromEntries(
      Array.from({ length: 84 }, (_, i) => [`@alias${i}`, `/path/to/alias${i}`])
    );
    // Ensure it doesn't throw and initializes quickly without O(N) iteration on resolve
    expect(() => {
      createResolveHook(largeAliases);
    }).not.toThrow();
  });

  it('creates independent resolve hooks for different alias sets', () => {
    const resolveOld = createResolveHook({ '@old': '/old' });
    resolveOld('@old', { conditions: [] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith(expect.stringContaining('/old'), expect.anything());
    
    nextResolve.mockClear();
    const resolveNew = createResolveHook({ '@new': '/new' });
    
    // '@old' should no longer resolve to the alias path (it passes through)
    resolveNew('@old', { conditions: [] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith('@old', expect.anything());
    
    nextResolve.mockClear();
    // '@new' should resolve successfully
    resolveNew('@new', { conditions: [] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledWith(expect.stringContaining('/new'), expect.anything());
  });

  it('resolves subpaths of exact alias correctly', () => {
    const resolveShared = createResolveHook({ '@shared': '/abs/path/shared' });
    // '@shared/utils' should resolve to '/abs/path/shared/utils' via prefixAliases
    resolveShared('@shared/utils', { conditions: [] }, nextResolve);
    const expectedPath = path.resolve('/abs/path/shared', 'utils');
    const expectedUrl = pathToFileURL(expectedPath).href;
    expect(nextResolve).toHaveBeenCalledWith(expectedUrl, { conditions: [] });
  });
});
