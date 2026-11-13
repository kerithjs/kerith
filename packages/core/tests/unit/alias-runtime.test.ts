import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAliasRuntime,
  ALIAS_RUNTIME_KEY,
  normalizeCanonicalFileUrl,
} from '../../src/aliases/runtime.js';
import { KerithError } from '../../src/core/errors.js';

describe('AliasRuntime (core/src/aliases/runtime.ts)', () => {
  beforeEach(() => {
    getAliasRuntime()._reset();
  });

  it('maintains a singleton on globalThis[ALIAS_RUNTIME_KEY]', () => {
    const runtime1 = getAliasRuntime();
    const runtime2 = (globalThis as any)[ALIAS_RUNTIME_KEY];
    expect(runtime1).toBe(runtime2);
  });

  it('normalizes file URLs canonically', () => {
    const normal = normalizeCanonicalFileUrl('/some/path/db.ts');
    expect(normal).toBe('file:///some/path/db.ts');

    const withQuery = normalizeCanonicalFileUrl('file:///some/path/db.ts?hash=123#frag');
    expect(withQuery).toBe('file:///some/path/db.ts');
  });

  it('declares alias and adds to table', () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/infrastructure/db.client.ts',
      factory: () => ({ pool: 1 }),
      options: { required: true },
    });

    expect(runtime.table.has('client/db')).toBe(true);
    expect(runtime.declarations.has('client/db')).toBe(true);

    const decl = runtime.declarations.get('client/db');
    expect(decl?.prefix).toBe('client');
    expect(decl?.name).toBe('db');
    expect(decl?.key).toBe('client/db');
    expect(decl?.options.required).toBe(true);
  });

  it('throws on invalid identifier name or prefix', () => {
    const runtime = getAliasRuntime();
    expect(() =>
      runtime.declare({
        prefix: 'client',
        name: 'db/invalid',
        filePath: '/test.ts',
        factory: () => ({}),
        options: {},
      }),
    ).toThrow(KerithError);

    expect(() =>
      runtime.declare({
        prefix: 'bad prefix',
        name: 'db',
        filePath: '/test.ts',
        factory: () => ({}),
        options: {},
      }),
    ).toThrow(KerithError);
  });

  it('throws DUPLICATE_ALIAS_IDENTIFIER for duplicate declaration in same file', () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/same/path.ts',
      factory: () => ({}),
      options: {},
    });

    expect(() =>
      runtime.declare({
        prefix: 'client',
        name: 'db',
        filePath: '/same/path.ts',
        factory: () => ({}),
        options: {},
      }),
    ).toThrowError(/duplicate Alias identifier "client\/db" inside the same file/);
  });

  it('throws DUPLICATE_EXTENSION_PROVIDER for duplicate declaration across different files', () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/file-one.ts',
      factory: () => ({}),
      options: {},
    });

    expect(() =>
      runtime.declare({
        prefix: 'client',
        name: 'db',
        filePath: '/file-two.ts',
        factory: () => ({}),
        options: {},
      }),
    ).toThrowError(/duplicate Alias identifier "client\/db" across different files/);
  });

  it('memoizes instance on get(key)', async () => {
    const runtime = getAliasRuntime();
    let callCount = 0;
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/infra.ts',
      factory: async () => {
        callCount++;
        return { count: callCount };
      },
      options: {},
    });

    const inst1 = await runtime.get('client/db');
    const inst2 = await runtime.get('client/db');

    expect(inst1).toBe(inst2);
    expect(callCount).toBe(1);
    expect((inst1 as any).count).toBe(1);
  });

  it('executes dispose in LIFO order on disposeAll()', async () => {
    const runtime = getAliasRuntime();
    const disposed: string[] = [];

    runtime.declare({
      prefix: 'config',
      name: 'app',
      filePath: '/config.ts',
      factory: () => ({ name: 'AppConfig' }),
      options: {
        dispose: () => {
          disposed.push('config/app');
        },
      },
    });

    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/db.ts',
      factory: () => ({ name: 'DbClient' }),
      options: {
        dispose: () => {
          disposed.push('client/db');
        },
      },
    });

    await runtime.get('config/app');
    await runtime.get('client/db');

    await runtime.disposeAll();

    expect(disposed).toEqual(['client/db', 'config/app']);
    expect(runtime.instances.size).toBe(0);
    expect(runtime.declarations.size).toBe(0);
  });

  it('throws ALIAS_NOT_FOUND with suggestion when key not in table', async () => {
    const runtime = getAliasRuntime();
    runtime.registerTableEntry('client/db', '/path/to/db.ts');

    await expect(runtime.get('client/database')).rejects.toThrowError(
      /Alias "@client\/database" not found in static alias table\. Did you mean: @client\/db\?/,
    );
  });

  it('returns undefined and warns when required: false and factory fails', async () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'redis-optional',
      filePath: '/redis.ts',
      factory: () => {
        throw new Error('Connection refused');
      },
      options: { required: false },
    });

    const res = await runtime.get('client/redis-optional');
    expect(res).toBeUndefined();
  });
});
