import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAliasRuntime } from '../../src/aliases/runtime.js';
import { runEagerAliases } from '../../src/bootstrap/steps/step-06b-eager-aliases.js';
import type { BootstrapContext } from '../../src/bootstrap/context.js';

// Minimal BootstrapContext stub — only fields used by runEagerAliases.
function makeCtx(overrides: Partial<BootstrapContext> = {}): BootstrapContext {
  return {
    log: undefined,
    config: {},
    ...overrides,
  } as unknown as BootstrapContext;
}

describe('step-06b-eager-aliases (runEagerAliases)', () => {
  beforeEach(() => {
    getAliasRuntime()._reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KERITH_PROFILE;
  });

  // ─── No-op paths ──────────────────────────────────────────────────────────

  it('does nothing when resolveAliases: false', async () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/db.ts',
      factory: () => ({ pool: 1 }),
    });

    await runEagerAliases(makeCtx({ config: { resolveAliases: false } as any }));

    // Instance not resolved
    expect(runtime.instances.has('client/db')).toBe(false);
  });

  it('does nothing when there are no declarations', async () => {
    // Should not throw
    await expect(runEagerAliases(makeCtx())).resolves.toBeUndefined();
  });

  // ─── Eager resolution ─────────────────────────────────────────────────────

  it('resolves non-lazy declarations in parallel', async () => {
    const runtime = getAliasRuntime();
    const order: string[] = [];

    runtime.declare({
      prefix: 'config',
      name: 'app',
      filePath: '/config.ts',
      factory: () => { order.push('config/app'); return { port: 3000 }; },
      options: { lazy: false },
    });
    runtime.declare({
      prefix: 'client',
      name: 'db',
      filePath: '/db.ts',
      factory: () => { order.push('client/db'); return { pool: 5 }; },
      options: { lazy: false },
    });

    await runEagerAliases(makeCtx());

    expect(runtime.instances.has('config/app')).toBe(true);
    expect(runtime.instances.has('client/db')).toBe(true);
    expect((runtime.instances.get('config/app') as any).port).toBe(3000);
    expect((runtime.instances.get('client/db') as any).pool).toBe(5);
    // Both ran (order not deterministic in parallel, but both present)
    expect(order).toHaveLength(2);
  });

  it('applies defaults (lazy: false by default) and resolves unnamed-lazy aliases', async () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'store',
      name: 'redis',
      filePath: '/redis.ts',
      factory: () => 'redis-instance',
      // No options.lazy specified — defaults to false
    });

    await runEagerAliases(makeCtx());

    expect(runtime.instances.get('store/redis')).toBe('redis-instance');
  });

  // ─── lazy: true skipped ───────────────────────────────────────────────────

  it('skips lazy: true declarations', async () => {
    const runtime = getAliasRuntime();
    let called = false;

    runtime.declare({
      prefix: 'client',
      name: 'lazy-one',
      filePath: '/lazy.ts',
      factory: () => { called = true; return 'lazy'; },
      options: { lazy: true },
    });

    await runEagerAliases(makeCtx());

    expect(called).toBe(false);
    expect(runtime.instances.has('client/lazy-one')).toBe(false);
  });

  it('resolves only non-lazy when mixed declarations exist', async () => {
    const runtime = getAliasRuntime();

    runtime.declare({
      prefix: 'config',
      name: 'app',
      filePath: '/config.ts',
      factory: () => ({ eager: true }),
      options: { lazy: false },
    });
    runtime.declare({
      prefix: 'client',
      name: 'optional',
      filePath: '/opt.ts',
      factory: () => ({ lazy: true }),
      options: { lazy: true },
    });

    await runEagerAliases(makeCtx());

    expect(runtime.instances.has('config/app')).toBe(true);
    expect(runtime.instances.has('client/optional')).toBe(false);
  });

  // ─── Error propagation ────────────────────────────────────────────────────

  it('propagates ALIAS_FACTORY_FAILED for a required alias that throws', async () => {
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'broken',
      filePath: '/broken.ts',
      factory: () => { throw new Error('DB unreachable'); },
      options: { required: true },
    });

    await expect(runEagerAliases(makeCtx())).rejects.toMatchObject({
      code: 'ALIAS_FACTORY_FAILED',
    });
  });

  it('does NOT propagate when required: false and factory throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'client',
      name: 'optional-broken',
      filePath: '/opt.ts',
      factory: () => { throw new Error('Redis offline'); },
      options: { required: false },
    });

    // Should resolve without throwing; instance is undefined
    await expect(runEagerAliases(makeCtx())).resolves.toBeUndefined();
    expect(runtime.instances.get('client/optional-broken')).toBeUndefined();
  });

  // ─── KERITH_PROFILE logging ───────────────────────────────────────────────

  it('emits debug log per alias when KERITH_PROFILE=true', async () => {
    process.env.KERITH_PROFILE = 'true';
    const debugFn = vi.fn();
    const log = { debug: debugFn } as any;

    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'config',
      name: 'app',
      filePath: '/config.ts',
      factory: () => ({ port: 3000 }),
    });

    await runEagerAliases(makeCtx({ log }));

    expect(debugFn).toHaveBeenCalledOnce();
    expect(debugFn.mock.calls[0][0]).toMatch(/\[perf\] alias @config\/app took \d+ms/);
  });

  it('does NOT emit debug log when KERITH_PROFILE is not set', async () => {
    const debugFn = vi.fn();
    const log = { debug: debugFn } as any;

    const runtime = getAliasRuntime();
    runtime.declare({
      prefix: 'config',
      name: 'app',
      filePath: '/config.ts',
      factory: () => ({ port: 3000 }),
    });

    await runEagerAliases(makeCtx({ log }));

    expect(debugFn).not.toHaveBeenCalled();
  });

  // ─── Idempotence ──────────────────────────────────────────────────────────

  it('running twice does not call factory twice (instances are memoized)', async () => {
    const runtime = getAliasRuntime();
    let calls = 0;
    runtime.declare({
      prefix: 'config',
      name: 'app',
      filePath: '/config.ts',
      factory: () => { calls++; return { port: 3000 }; },
    });

    await runEagerAliases(makeCtx());
    await runEagerAliases(makeCtx());

    expect(calls).toBe(1);
  });
});

