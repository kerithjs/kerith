import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { activateAliasResolver, clearAliasResolverOptions } from '../../src/aliases/resolver.js';
import * as nodeModule from 'node:module';

vi.mock('node:module', async () => {
  const actual = await vi.importActual('node:module') as any;
  return {
    ...actual,
    registerHooks: vi.fn(() => ({ deregister: vi.fn() }))
  };
});

describe('Resolver Guard 2 (anti-double-registration)', () => {
  const dummyLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAliasResolverOptions();
    delete (globalThis as any).__KERITH_PRELOAD_CONFIG__;
  });

  afterEach(() => {
    delete (globalThis as any).__KERITH_PRELOAD_CONFIG__;
  });

  it('activateAliasResolver() calls module.registerHooks() when global is not present (v1.4.0 behavior)', async () => {
    await activateAliasResolver({ '@modules': '/abs/src/modules' }, {}, dummyLog);
    expect(nodeModule.registerHooks).toHaveBeenCalledTimes(1);
  });

  it('activateAliasResolver() does not call module.registerHooks() if globalThis.__KERITH_PRELOAD_CONFIG__.preloaded === true', async () => {
    (globalThis as any).__KERITH_PRELOAD_CONFIG__ = {
      preloaded: true,
      aliases: {}
    };

    await activateAliasResolver({ '@modules': '/abs/src/modules' }, {}, dummyLog);
    expect(nodeModule.registerHooks).not.toHaveBeenCalled();
    expect(dummyLog.debug).toHaveBeenCalledWith(expect.stringContaining('skipped'), expect.any(Object));
  });

  it('mergeAliasesIntoPreloadConfig() adds aliases without overwriting existing ones', async () => {
    (globalThis as any).__KERITH_PRELOAD_CONFIG__ = {
      preloaded: true,
      aliases: {
        '@existing': '/abs/existing'
      }
    };

    await activateAliasResolver({ '@modules': '/abs/src/modules' }, { '@custom': '/abs/src/custom' }, dummyLog);
    
    const config = (globalThis as any).__KERITH_PRELOAD_CONFIG__;
    expect(config.aliases).toEqual({
      '@existing': '/abs/existing',
      '@modules': expect.stringContaining('modules'),
      '@custom': expect.stringContaining('custom')
    });
  });

  it('deregister() is called when aliases change to prevent duplicate hooks', async () => {
    const deregisterSpy = vi.fn();
    (nodeModule.registerHooks as any).mockReturnValue({ deregister: deregisterSpy });

    // First registration
    await activateAliasResolver({ '@modules': '/abs/src/modules' }, {}, dummyLog);
    expect(nodeModule.registerHooks).toHaveBeenCalledTimes(1);
    expect(deregisterSpy).not.toHaveBeenCalled();

    // Second registration with different aliases should call deregister first
    await activateAliasResolver({ '@modules': '/abs/src/modules' }, { '@new': '/abs/new' }, dummyLog);
    expect(deregisterSpy).toHaveBeenCalledTimes(1);
    expect(nodeModule.registerHooks).toHaveBeenCalledTimes(2);
  });
});
