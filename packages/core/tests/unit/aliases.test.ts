import { describe, it, expect, vi, afterEach } from 'vitest';
import { resetGlobalState } from '../../src/core/state.js';
import { updateAliasCache, getAliasCache } from '../../src/aliases/cache.js';
import { getAliases } from '../../src/aliases/getAliases.js';
import * as resolver from '../../src/aliases/resolver.js';
// @ts-expect-error Node typings might be outdated or not have this experimental feature exported cleanly yet
import { registerHooks } from 'node:module';
import path from 'node:path';
import { createRegistry, registryContext } from '../../src/core/registry.js';

vi.mock('node:module', () => ({
  registerHooks: vi.fn(() => ({ deregister: vi.fn() }))
}));

describe('Aliases API', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
    resetGlobalState();
  });

  // Helper: seed the cache as createApp would after Phase 3
  function seedCache(extra: Record<string, string> = {}) {
    updateAliasCache({
      '@modules/users': path.join(process.cwd(), 'modules/users'),
      '@config/database': path.join(process.cwd(), 'config/db'),
      ...extra
    });
  }

  it('getAliases() returns {} without throwing when called before createApp()', async () => {
    // resetGlobalState ensures we are working with an empty cache
    resetGlobalState();
    const result = await getAliases();
    expect(result).toEqual({});
  });

  it('getAliasCache() returns from active registry context when one is running', async () => {
    const r = createRegistry();
    // Seed an alias directly in the global cache first
    updateAliasCache({ '@modules/foo': '/abs/foo' });

    await registryContext.run(r, async () => {
      // Inside a registry context, getAliasCache() delegates to the registry
      const cache = getAliasCache();
      // The registry was just created and has no aliases registered yet
      expect(cache).toEqual({});
    });
  });

  it('getAliases() returns entries for all seeded aliases', async () => {
    seedCache();
    const result = await getAliases();
    expect(result['@modules/users']).toBeDefined();
    expect(result['@config/database']).toBeDefined();
  });

  it('getAliases({ includeFolders: false }) keeps @modules/* and drops others', async () => {
    seedCache();
    const result = await getAliases({ includeFolders: false });
    // @modules/* should still be present
    expect(result['@modules/users']).toBeDefined();
    // @config/* is not a @modules/ prefix — excluded
    expect(result['@config/database']).toBeUndefined();
  });

  it('getAliases({ absolute: true }) returns the exact stored paths for modules and config aliases', async () => {
    seedCache({ '@shared': path.join(process.cwd(), 'src/shared') });
    const result = await getAliases({ absolute: true });
    expect(result['@modules/users']).toBe(path.join(process.cwd(), 'modules/users'));
    expect(result['@config/database']).toBe(path.join(process.cwd(), 'config/db'));
    expect(result['@shared']).toBe(path.join(process.cwd(), 'src/shared'));
  });

  it('getAliases({ absolute: false }) returns POSIX-relative paths starting with ./', async () => {
    seedCache();
    const result = await getAliases({ absolute: false });
    for (const val of Object.values(result)) {
      expect(val.startsWith('./')).toBe(true);
      // POSIX — no backslashes
      expect(val).not.toContain('\\');
    }
  });

  it('activateAliasResolver registers the hook exactly once on repeated calls', async () => {
    await resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' }, mockLogger as any);
    await resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' }, mockLogger as any);

    expect(registerHooks).toHaveBeenCalledTimes(1);

    const [opts] = (registerHooks as any).mock.calls[0];
    
    // The hook must be a function that resolves aliases
    expect(typeof opts.resolve).toBe('function');
  });

  it('activateAliasResolver embeds all combined aliases into the hook source', async () => {
    const moduleAliases = { '@modules/auth': '/path/auth' };
    const folderAliases = { '@shared': '/path/shared' };
    await resolver.activateAliasResolver(moduleAliases, folderAliases, mockLogger as any);

    const [opts] = (registerHooks as any).mock.calls[0];
    
    // Verify that the hook is a callable resolve function
    expect(typeof opts.resolve).toBe('function');

    // Verify the hook actually resolves our aliases (behavioural check)
    const next = vi.fn((s: string) => ({ url: s, shortCircuit: true }));
    opts.resolve('@modules/auth', { conditions: [] }, next);
    expect(next).toHaveBeenCalledWith(
      expect.stringContaining('/path/auth'),
      expect.anything()
    );
  });

  it('user configured aliases take precedence over auto-generated module aliases', async () => {
    const moduleAliases = { '@modules/auth': '/path/auto' };
    const folderAliases = { '@modules/auth': '/path/configured' };
    await resolver.activateAliasResolver(moduleAliases, folderAliases, mockLogger as any);

    const [opts] = (registerHooks as any).mock.calls[0];
    
    // Verify folder aliases override module aliases by testing the resolved path
    const next = vi.fn((s: string) => ({ url: s, shortCircuit: true }));
    opts.resolve('@modules/auth', { conditions: [] }, next);
    // Must resolve to the folder (user-configured) path, not the auto-generated one
    expect(next).toHaveBeenCalledWith(
      expect.stringContaining('/path/configured'),
      expect.anything()
    );
  });

  it('ESM hook resolves subpaths correctly (P2/P6)', async () => {
    await resolver.activateAliasResolver({}, { '@config': '/abs/config' }, mockLogger as any);
    
    const [opts] = (registerHooks as any).mock.calls[0];
    
    // Verify that subpath resolution works: @config/db → /abs/config/db
    const next = vi.fn((s: string) => ({ url: s, shortCircuit: true }));
    opts.resolve('@config/settings', { conditions: [] }, next);
    expect(next).toHaveBeenCalledWith(
      expect.stringContaining('/abs/config/settings'),
      expect.anything()
    );
    // Exact match still works
    next.mockClear();
    opts.resolve('@config', { conditions: [] }, next);
    expect(next).toHaveBeenCalledWith(
      expect.stringContaining('/abs/config'),
      expect.anything()
    );
  });
});
