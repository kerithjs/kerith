import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  // ─── Singleton ────────────────────────────────────────────────────────────

  it('maintains a singleton on globalThis[ALIAS_RUNTIME_KEY]', () => {
    const runtime1 = getAliasRuntime();
    const runtime2 = (globalThis as any)[ALIAS_RUNTIME_KEY];
    expect(runtime1).toBe(runtime2);
  });

  // ─── normalizeCanonicalFileUrl ────────────────────────────────────────────

  it('normalizes file URLs canonically', () => {
    const normal = normalizeCanonicalFileUrl('/some/path/db.ts');
    expect(normal).toBe('file:///some/path/db.ts');

    const withQuery = normalizeCanonicalFileUrl('file:///some/path/db.ts?hash=123#frag');
    expect(withQuery).toBe('file:///some/path/db.ts');
  });

  // ─── declare — happy path ─────────────────────────────────────────────────

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

  it('applies defaults when options are omitted', () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/infra.ts',
      factory: () => ({}),
    });
    const decl = runtime.declarations.get('client/db');
    expect(decl?.options.lazy).toBe(false);
    expect(decl?.options.required).toBe(true);
    expect(decl?.options.timeout).toBe(30000);
  });

  // ─── declare — name / prefix validation ──────────────────────────────────

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

  // ─── 6.1 — Option validation ──────────────────────────────────────────────

  describe('6.1 — Option validation', () => {
    it('accepts valid options without throwing', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { lazy: false, required: true, timeout: 5000, dispose: () => {} },
        }),
      ).not.toThrow();
    });

    it('accepts timeout: 0 (no timeout)', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'noto',
          filePath: '/noto.ts',
          factory: () => ({}),
          options: { timeout: 0 },
        }),
      ).not.toThrow();
    });

    it('throws ALIAS_INVALID when timeout is negative', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { timeout: -1 },
        }),
      ).toThrowError(/ALIAS_INVALID|must be a non-negative integer/);
    });

    it('throws ALIAS_INVALID when timeout is a float', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { timeout: 1.5 },
        }),
      ).toThrowError(/ALIAS_INVALID|must be a non-negative integer/);
    });

    it('throws ALIAS_INVALID when timeout is a string', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { timeout: '5000' as any },
        }),
      ).toThrowError(/ALIAS_INVALID|must be a non-negative integer/);
    });

    it('throws ALIAS_INVALID when lazy is not boolean', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { lazy: 1 as any },
        }),
      ).toThrowError(/ALIAS_INVALID|must be a boolean/);
    });

    it('throws ALIAS_INVALID when required is not boolean', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { required: 'yes' as any },
        }),
      ).toThrowError(/ALIAS_INVALID|must be a boolean/);
    });

    it('throws ALIAS_INVALID when dispose is not a function', () => {
      const runtime = getAliasRuntime();
      expect(() =>
        runtime.declare({
          prefix: 'client',
          name: 'db',
          filePath: '/db.ts',
          factory: () => ({}),
          options: { dispose: 'cleanup' as any },
        }),
      ).toThrowError(/ALIAS_INVALID|must be a function/);
    });
  });

  // ─── declare — duplicate detection ────────────────────────────────────────

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

  // ─── get — memoization ────────────────────────────────────────────────────

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

  // ─── disposeAll ───────────────────────────────────────────────────────────

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

  // ─── ALIAS_NOT_FOUND ──────────────────────────────────────────────────────

  it('throws ALIAS_NOT_FOUND with suggestion when key not in table', async () => {
    const runtime = getAliasRuntime();
    runtime.registerTableEntry('client/db', '/path/to/db.ts');

    await expect(runtime.get('client/database')).rejects.toThrowError(
      /Alias "@client\/database" not found in static alias table\. Did you mean: @client\/db\?/,
    );
  });

  // ─── 6.2 — ALIAS_FACTORY_FAILED ──────────────────────────────────────────

  describe('6.2 — ALIAS_FACTORY_FAILED', () => {
    it('wraps a synchronous factory throw in ALIAS_FACTORY_FAILED with cause', async () => {
      const runtime = getAliasRuntime();
      const originalError = new Error('Connection refused');
      runtime.declare({
        prefix: 'client',
        name: 'redis',
        filePath: '/redis.ts',
        factory: () => {
          throw originalError;
        },
        options: {},
      });

      const err = await runtime.get('client/redis').catch((e) => e);
      expect(err).toBeInstanceOf(KerithError);
      expect(err.code).toBe('ALIAS_FACTORY_FAILED');
      expect(err.message).toMatch(/Factory for alias "@client\/redis" failed/);
      expect(err.cause).toBe(originalError);
    });

    it('wraps an async factory rejection in ALIAS_FACTORY_FAILED with cause', async () => {
      const runtime = getAliasRuntime();
      const originalError = new Error('async boom');
      runtime.declare({
        prefix: 'client',
        name: 'async-fail',
        filePath: '/async.ts',
        factory: async () => {
          throw originalError;
        },
        options: {},
      });

      const err = await runtime.get('client/async-fail').catch((e) => e);
      expect(err).toBeInstanceOf(KerithError);
      expect(err.code).toBe('ALIAS_FACTORY_FAILED');
      expect(err.cause).toBe(originalError);
    });

    it('does not double-wrap a KerithError thrown by the factory', async () => {
      const runtime = getAliasRuntime();
      const kerithErr = new KerithError('ALIAS_CONFLICT', 'conflict!');
      runtime.declare({
        prefix: 'client',
        name: 'kerith-fail',
        filePath: '/k.ts',
        factory: () => {
          throw kerithErr;
        },
        options: {},
      });

      const err = await runtime.get('client/kerith-fail').catch((e) => e);
      expect(err).toBe(kerithErr);
      expect(err.code).toBe('ALIAS_CONFLICT');
    });
  });

  // ─── 6.2 — Config null/undefined returns ALIAS_FACTORY_FAILED ────────────

  describe('6.2 — Config prefix null/undefined rejection', () => {
    it('throws ALIAS_FACTORY_FAILED when Config factory returns undefined', async () => {
      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'config',
        name: 'app',
        filePath: '/config.ts',
        factory: () => undefined,
        options: {},
      });

      const err = await runtime.get('config/app').catch((e) => e);
      expect(err).toBeInstanceOf(KerithError);
      expect(err.code).toBe('ALIAS_FACTORY_FAILED');
      expect(err.message).toMatch(/Config.*returned/);
    });

    it('throws ALIAS_FACTORY_FAILED when Config factory returns null', async () => {
      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'config',
        name: 'db',
        filePath: '/config-db.ts',
        factory: () => null,
        options: {},
      });

      const err = await runtime.get('config/db').catch((e) => e);
      expect(err).toBeInstanceOf(KerithError);
      expect(err.code).toBe('ALIAS_FACTORY_FAILED');
    });

    it('does NOT reject null/undefined for non-Config prefixes', async () => {
      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'client',
        name: 'optional-null',
        filePath: '/client.ts',
        factory: () => null,
        options: {},
      });

      const result = await runtime.get('client/optional-null');
      expect(result).toBeNull();
    });
  });

  // ─── 6.2 — required: false ───────────────────────────────────────────────

  describe('6.2 — required: false', () => {
    it('returns undefined and warns when required: false and factory fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });

    it('warns only once when called multiple times with required: false', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'client',
        name: 'optional-multi',
        filePath: '/opt.ts',
        factory: () => {
          throw new Error('fail');
        },
        options: { required: false },
      });

      await runtime.get('client/optional-multi');
      await runtime.get('client/optional-multi');
      await runtime.get('client/optional-multi');

      // instance is memoized after first call; warn should fire exactly once
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });

    it('memoizes undefined so subsequent calls return same undefined without re-running factory', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const runtime = getAliasRuntime();
      let calls = 0;
      runtime.declare({
        prefix: 'client',
        name: 'optional-memo',
        filePath: '/opt.ts',
        factory: () => {
          calls++;
          throw new Error('fail');
        },
        options: { required: false },
      });

      const r1 = await runtime.get('client/optional-memo');
      const r2 = await runtime.get('client/optional-memo');
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(calls).toBe(1);
      vi.restoreAllMocks();
    });
  });

  // ─── 6.2 — ALIAS_FACTORY_TIMEOUT ─────────────────────────────────────────

  describe('6.2 — ALIAS_FACTORY_TIMEOUT', () => {
    it('throws ALIAS_FACTORY_TIMEOUT when factory hangs beyond timeout', async () => {
      vi.useFakeTimers();
      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'client',
        name: 'slow',
        filePath: '/slow.ts',
        factory: () => new Promise(() => {}), // never resolves
        options: { timeout: 100 },
      });

      const p = runtime.get('client/slow');
      // Attach catch immediately to suppress unhandled-rejection before timers fire
      const pCaught = p.catch((e) => e);
      await vi.advanceTimersByTimeAsync(200);

      const err = await pCaught;
      expect(err).toBeInstanceOf(KerithError);
      expect(err.code).toBe('ALIAS_FACTORY_TIMEOUT');
      expect(err.message).toMatch(/timed out after 100ms/);
      vi.useRealTimers();
    }, 10000);

    it('includes cycle hint in ALIAS_FACTORY_TIMEOUT when other keys are in-flight', async () => {
      vi.useFakeTimers();
      const runtime = getAliasRuntime();

      // Both factories hang — they'll both be in-flight when the timeout fires.
      runtime.declare({
        prefix: 'client',
        name: 'a',
        filePath: '/a.ts',
        factory: () => new Promise(() => {}), // never resolves
        options: { timeout: 100 },
      });
      runtime.declare({
        prefix: 'client',
        name: 'b',
        filePath: '/b.ts',
        factory: () => new Promise(() => {}), // never resolves
        options: { timeout: 100 },
      });

      // Attach catch handlers immediately to suppress unhandled rejections
      const paCaught = runtime.get('client/a').catch((e) => e);
      const pbCaught = runtime.get('client/b').catch((e) => e);

      await vi.advanceTimersByTimeAsync(200);

      const errA = await paCaught;
      expect(errA.code).toBe('ALIAS_FACTORY_TIMEOUT');
      expect(errA.message).toMatch(/Possible cycle between aliases/);

      const errB = await pbCaught;
      expect(errB.code).toBe('ALIAS_FACTORY_TIMEOUT');

      vi.useRealTimers();
    }, 10000);

    it('does NOT apply timeout when timeout: 0', async () => {
      // Use real timers — the factory resolves quickly (1 ms), no need for fake.
      const runtime = getAliasRuntime();
      runtime.declare({
        prefix: 'client',
        name: 'no-timeout',
        filePath: '/nt.ts',
        factory: () =>
          new Promise<string>((res) => {
            setTimeout(() => res('done'), 1);
          }),
        options: { timeout: 0 },
      });

      const result = await runtime.get('client/no-timeout');
      expect(result).toBe('done');
    }, 5000);
  });

  // ─── 6.2 — ALIAS_CIRCULAR ────────────────────────────────────────────────

  describe('6.2 — ALIAS_CIRCULAR (synchronous cycle guard)', () => {
    it('throws ALIAS_CIRCULAR when resolvingKeys already contains the key', async () => {
      const runtime = getAliasRuntime();

      runtime.declare({
        prefix: 'client',
        name: 'cyclic',
        filePath: '/cyclic.ts',
        factory: () => ({}),
        options: { timeout: 1000 },
      });

      // Directly test the cycle guard in resolveKey: when resolvingKeys has the key
      (runtime as any).resolvingKeys.add('client/cyclic');
      const err = await (runtime as any).resolveKey('client/cyclic').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KerithError);
      expect(err.code).toBe('ALIAS_CIRCULAR');
      expect(err.message).toMatch(/Circular dependency detected while resolving alias "@client\/cyclic"/);    });
  });
});
