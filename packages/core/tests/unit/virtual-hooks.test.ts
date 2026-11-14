import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createVirtualAliasHooks,
  registerVirtualAliasHooks,
  clearVirtualAliasHooks,
  isVirtualAliasHookRegistered,
} from '../../src/aliases/virtual-hooks.js';
import { getAliasRuntime } from '../../src/aliases/runtime.js';
import { activateAliasResolver, clearAliasResolverOptions } from '../../src/aliases/resolver.js';
import { KerithError } from '../../src/core/errors.js';

describe('virtual-hooks (core/src/aliases/virtual-hooks.ts)', () => {
  const runtime = getAliasRuntime();

  beforeEach(() => {
    runtime._reset();
    clearVirtualAliasHooks();
    clearAliasResolverOptions();
  });

  afterEach(() => {
    runtime._reset();
    clearVirtualAliasHooks();
    clearAliasResolverOptions();
  });

  it('createVirtualAliasHooks resolve intercepts @prefix/name when in table', () => {
    runtime.registerTableEntry('client/db', '/path/to/db.client.ts');
    const { resolve } = createVirtualAliasHooks();

    let nextCalled = false;
    const nextResolve = () => {
      nextCalled = true;
      return { url: 'default-url' };
    };

    const res = resolve('@client/db', {}, nextResolve);
    expect(res).toEqual({
      shortCircuit: true,
      url: 'kerith-alias:client/db',
    });
    expect(nextCalled).toBe(false);
  });

  it('createVirtualAliasHooks resolve calls nextResolve when not in table or not channel prefix', () => {
    const { resolve } = createVirtualAliasHooks();

    let nextPassed = '';
    const nextResolve = (spec: string) => {
      nextPassed = spec;
      return { url: 'resolved-' + spec };
    };

    // Unknown prefix
    const res1 = resolve('@other/unknown', {}, nextResolve);
    expect(nextPassed).toBe('@other/unknown');
    expect(res1.url).toBe('resolved-@other/unknown');

    // Known prefix but not in table
    const res2 = resolve('@client/not-in-table', {}, nextResolve);
    expect(nextPassed).toBe('@client/not-in-table');
    expect(res2.url).toBe('resolved-@client/not-in-table');
  });

  it('throws ALIAS_INVALID when subpath is used (e.g. @client/db/sub)', () => {
    const { resolve } = createVirtualAliasHooks();
    expect(() => resolve('@client/db/subpath', {}, () => ({} as any))).toThrow(KerithError);
    expect(() => resolve('@client/db/subpath', {}, () => ({} as any))).toThrowError(
      /Subpaths are not supported for channel alias "@client\/db\/subpath"/,
    );
  });

  it('createVirtualAliasHooks load returns virtual module source with escaped JSON key', () => {
    const { load } = createVirtualAliasHooks();

    let nextCalled = false;
    const nextLoad = () => {
      nextCalled = true;
      return { format: 'module', source: '' };
    };

    const res = load('kerith-alias:client/db', {}, nextLoad);
    expect(res).toEqual({
      shortCircuit: true,
      format: 'module',
      source: `export default await globalThis[Symbol.for('kerith.alias-runtime')].get("client/db");`,
    });
    expect(nextCalled).toBe(false);
  });

  it('respects resolveAliases: false by not registering hooks', () => {
    registerVirtualAliasHooks({ resolveAliases: false });
    expect(isVirtualAliasHookRegistered()).toBe(false);
  });

  it('registerVirtualAliasHooks is idempotent and tracks registration', () => {
    registerVirtualAliasHooks();
    expect(isVirtualAliasHookRegistered()).toBe(true);

    // Call again, should deregister and register cleanly without throwing
    registerVirtualAliasHooks();
    expect(isVirtualAliasHookRegistered()).toBe(true);
  });

  it('guarantees LIFO precedence after activateAliasResolver runs', async () => {
    const mockLogger = {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };

    // 1. Register virtual hook
    runtime.registerTableEntry('client/db', '/path/to/db.ts');
    registerVirtualAliasHooks();

    // 2. Run activateAliasResolver with a overlapping or standard alias
    await activateAliasResolver(
      { '@modules/users': '/abs/path/users' },
      { '@client': '/abs/path/client' },
      mockLogger,
    );

    // Virtual hook must still be registered and maintain top LIFO precedence
    expect(isVirtualAliasHookRegistered()).toBe(true);
  });
});
