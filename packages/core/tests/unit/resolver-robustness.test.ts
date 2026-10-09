import { describe, it, expect, vi, afterEach } from 'vitest';
import { activateAliasResolver, clearAliasResolverOptions } from '../../src/aliases/resolver.js';
import * as nodeModule from 'node:module';

vi.mock('node:module', () => ({
  registerHooks: vi.fn(() => ({ deregister: vi.fn() }))
}));

describe('ESM Resolver Robustness (P2)', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
    clearAliasResolverOptions();
  });

  it('should resolve subpaths for aliases without wildcard', async () => {
    await activateAliasResolver({}, { '@shared': './src/shared' }, mockLogger as any);
    
    const registerHooks = vi.mocked((nodeModule as any).registerHooks);
    const [opts] = registerHooks.mock.calls[0];
    
    // Check if the resolve hook logic for subpaths is present
    expect(opts.resolve.toString()).toContain('specifier.startsWith(alias + "/")');
    // Check that the alias is referenced in the closure
    expect(opts.resolve.toString()).toContain('combinedAliases');
  });

  it('should allow multiple registrations if aliases change (idempotency)', async () => {
    await activateAliasResolver({}, { '@a': './a' }, mockLogger as any);
    await activateAliasResolver({}, { '@b': './b' }, mockLogger as any);
    
    expect(vi.mocked((nodeModule as any).registerHooks)).toHaveBeenCalledTimes(2);
  });

  it('should accumulate aliases on successive calls', async () => {
    await activateAliasResolver({}, { '@first': './first' }, mockLogger as any);
    await activateAliasResolver({}, { '@second': './second' }, mockLogger as any);
    
    // The second registration call happened — verify log shows total accumulated aliases
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('ESM alias hook activated (2 alias(es))'),
      expect.objectContaining({ aliasCount: 2 })
    );
  });

  it('should skip registration if aliases are identical', async () => {
    await activateAliasResolver({}, { '@a': './a' }, mockLogger as any);
    await activateAliasResolver({}, { '@a': './a' }, mockLogger as any);
    
    expect(vi.mocked((nodeModule as any).registerHooks)).toHaveBeenCalledTimes(1);
  });

  it('should handle wildcard aliases correctly with the new logic', async () => {
    await activateAliasResolver({}, { '@modules/*': './src/modules/*' }, mockLogger as any);
    
    const registerHooks = vi.mocked((nodeModule as any).registerHooks);
    const [opts] = registerHooks.mock.calls[0];
    
    expect(opts.resolve.toString()).toContain('alias.endsWith("/*")');
    // Check that the alias is referenced in the closure
    expect(opts.resolve.toString()).toContain('combinedAliases');
  });
});
