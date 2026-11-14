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
import { execFileSync } from 'node:child_process';
import path from 'node:path';

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

  it('throws ALIAS_INVALID when subpath is used on an alias in the table (e.g. @client/db/sub)', () => {
    runtime.registerTableEntry('client/db', '/path/to/db.ts');
    const { resolve } = createVirtualAliasHooks();

    expect(() => resolve('@client/db/subpath', {}, () => ({} as any))).toThrow(KerithError);
    expect(() => resolve('@client/db/subpath', {}, () => ({} as any))).toThrowError(
      /Subpaths are not supported for channel alias "@client\/db\/subpath"/,
    );
  });

  it('does NOT throw ALIAS_INVALID for subpath if base alias is NOT in table (GAP-6 protection)', () => {
    const { resolve } = createVirtualAliasHooks();
    let passedToNext = '';
    const nextResolve = (s: string) => {
      passedToNext = s;
      return { url: 'folder-path/' + s };
    };

    // @client/utils/logger where client/utils is NOT in runtime.table
    const res = resolve('@client/utils/logger', {}, nextResolve);
    expect(passedToNext).toBe('@client/utils/logger');
    expect(res.url).toBe('folder-path/@client/utils/logger');
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

    registerVirtualAliasHooks();
    expect(isVirtualAliasHookRegistered()).toBe(true);
  });

  it('verifies real Node.js ESM resolve+load and LIFO precedence in native process', () => {
    // Tests resolve+load end-to-end in real Node ESM subprocess where registerHooks loader thread is active
    const script = `
      import { registerVirtualAliasHooks, activateAliasResolver, getAliasRuntime } from './dist/index.js';

      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'client',
        name: 'db',
        filePath: '/path/to/db.ts',
        factory: () => ({ instanceName: 'MockPostgres', ok: true }),
        options: {},
      });
      registerVirtualAliasHooks();

      await activateAliasResolver(
        {},
        { '@client': '/some/other/folder' },
        { debug() {}, info() {}, warn() {}, error() {} }
      );

      const mod = await import('@client/db');
      console.log('REAL_ESM_IMPORT:' + JSON.stringify(mod.default));
    `;

    const out = execFileSync(
      process.execPath,
      ['-e', script],
      {
        cwd: path.resolve(import.meta.dirname, '../../'),
        encoding: 'utf8',
      },
    );

    expect(out).toContain('REAL_ESM_IMPORT:{"instanceName":"MockPostgres","ok":true}');
  });
});
