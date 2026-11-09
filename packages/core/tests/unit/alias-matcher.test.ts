/**
 * @file tests/unit/alias-matcher.test.ts
 *
 * Tests for `createAliasMatcher` — the pure function extracted as part of
 * BUG-02 fix (A1.2).  These tests exercise the resolution logic WITHOUT
 * `registerHooks`, making them fast and fully deterministic.
 *
 * Roadmap notes embedded inline:
 *  - it.todo  → `@billing/orders/bill` without extension in plain Node (§12)
 *  - it.fails → bare aliases `@billing`, `@shared` still return dir (BUG-04)
 */

import { describe, it, expect, vi } from 'vitest';
import { createAliasMatcher } from '../../src/aliases/matcher.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// ── Shared mock nextResolve ───────────────────────────────────────────────────

function makeNext() {
  return vi.fn((specifier: string) => ({ url: specifier, shortCircuit: true as const }));
}

const CTX = { conditions: [] as string[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileUrl(p: string) {
  return pathToFileURL(p).href;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('createAliasMatcher (BUG-02 / A1.2)', () => {
  // ---------------------------------------------------------------------------
  // Core contract: exact wins over prefix
  // ---------------------------------------------------------------------------

  describe('core resolution order', () => {
    /**
     * BUG-02 regression: `@billing` is inserted first, so the old loop matched
     * `@billing/orders` via `startsWith('@billing/')` → directory.
     * The fixed matcher must hit the exact entry instead.
     */
    it('@billing/orders → exact index.ts even when @billing is inserted first', () => {
      const next = makeNext();
      // Deliberate order: domain alias before module alias (as step-05 inserts them)
      const resolve = createAliasMatcher({
        '@billing':         '/src/billing',
        '@billing/*':       '/src/billing/*',
        '@billing/orders':  '/src/billing/orders/index.ts',
        '@billing/orders/*':'/src/billing/orders/*',
      });

      resolve('@billing/orders', CTX, next);

      // Must hit the exact file, NOT the wildcard or prefix directory.
      expect(next).toHaveBeenCalledWith(
        fileUrl('/src/billing/orders/index.ts'),
        CTX
      );
    });

    it('@billing/orders/bill → wildcard @billing/orders/* and NOT @billing/*', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({
        '@billing':          '/src/billing',
        '@billing/*':        '/src/billing/*',
        '@billing/orders':   '/src/billing/orders/index.ts',
        '@billing/orders/*': '/src/billing/orders/*',
      });

      resolve('@billing/orders/bill', CTX, next);

      const expected = path.resolve('/src/billing/orders', 'bill');
      expect(next).toHaveBeenCalledWith(fileUrl(expected), CTX);
    });

    it('fallback wildcard @billing/* is used when no more-specific entry exists', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({
        '@billing':    '/src/billing',
        '@billing/*':  '/src/billing/*',
      });

      resolve('@billing/payments', CTX, next);

      const expected = path.resolve('/src/billing', 'payments');
      expect(next).toHaveBeenCalledWith(fileUrl(expected), CTX);
    });

    it('exact match for bare alias', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({ '@config': '/abs/config.ts' });
      resolve('@config', CTX, next);
      expect(next).toHaveBeenCalledWith(fileUrl('/abs/config.ts'), CTX);
    });

    it('implicit prefix: @shared/utils resolves via @shared prefix', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({ '@shared': '/abs/shared' });
      resolve('@shared/utils', CTX, next);
      const expected = path.resolve('/abs/shared', 'utils');
      expect(next).toHaveBeenCalledWith(fileUrl(expected), CTX);
    });

    it('non-alias specifier passes through unchanged', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({ '@config': '/abs/config.ts' });
      resolve('node:fs', CTX, next);
      expect(next).toHaveBeenCalledWith('node:fs', CTX);
    });
  });

  // ---------------------------------------------------------------------------
  // Order-independence — the result must NOT depend on Object.entries order
  // ---------------------------------------------------------------------------

  describe('order-independence (permutations)', () => {
    const BASE_ALIASES = {
      '@billing':          '/src/billing',
      '@billing/*':        '/src/billing/*',
      '@billing/orders':   '/src/billing/orders/index.ts',
      '@billing/orders/*': '/src/billing/orders/*',
    };

    // Three permutations of the keys
    const permutations: Array<Record<string, string>> = [
      // Natural order (domain first — the original bug trigger)
      BASE_ALIASES,
      // Module first
      {
        '@billing/orders':   '/src/billing/orders/index.ts',
        '@billing/orders/*': '/src/billing/orders/*',
        '@billing':          '/src/billing',
        '@billing/*':        '/src/billing/*',
      },
      // Wildcard first
      {
        '@billing/*':        '/src/billing/*',
        '@billing/orders/*': '/src/billing/orders/*',
        '@billing':          '/src/billing',
        '@billing/orders':   '/src/billing/orders/index.ts',
      },
    ];

    for (const [idx, aliases] of permutations.entries()) {
      it(`permutation ${idx + 1}: @billing/orders always resolves to index.ts`, () => {
        const next = makeNext();
        const resolve = createAliasMatcher(aliases);
        resolve('@billing/orders', CTX, next);
        expect(next).toHaveBeenCalledWith(
          fileUrl('/src/billing/orders/index.ts'),
          CTX
        );
      });

      it(`permutation ${idx + 1}: @billing/orders/bill resolves via @billing/orders/*`, () => {
        const next = makeNext();
        const resolve = createAliasMatcher(aliases);
        resolve('@billing/orders/bill', CTX, next);
        const expected = path.resolve('/src/billing/orders', 'bill');
        expect(next).toHaveBeenCalledWith(fileUrl(expected), CTX);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // D-06: @billing/shared/db vs @billing/*
  // ---------------------------------------------------------------------------

  describe('D-06: @billing/shared/db vs @billing/*', () => {
    it('@billing/shared/db resolves via wildcard @billing/* when no specific entry exists', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({
        '@billing':   '/src/billing',
        '@billing/*': '/src/billing/*',
      });
      resolve('@billing/shared/db', CTX, next);
      const expected = path.resolve('/src/billing', 'shared/db');
      expect(next).toHaveBeenCalledWith(fileUrl(expected), CTX);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-domain: @shipping/orders and @users/core alongside @billing
  // ---------------------------------------------------------------------------

  describe('multi-domain resolution (R3 subset)', () => {
    const aliases = {
      '@billing':          '/src/billing',
      '@billing/*':        '/src/billing/*',
      '@billing/orders':   '/src/billing/orders/index.ts',
      '@billing/orders/*': '/src/billing/orders/*',
      '@shipping':         '/src/shipping',
      '@shipping/*':       '/src/shipping/*',
      '@shipping/orders':  '/src/shipping/orders/index.ts',
      '@users':            '/src/users',
      '@users/*':          '/src/users/*',
      '@users/core':       '/src/users/core/index.ts',
    };

    it('@billing/orders resolves to billing index', () => {
      const next = makeNext();
      createAliasMatcher(aliases)('@billing/orders', CTX, next);
      expect(next).toHaveBeenCalledWith(fileUrl('/src/billing/orders/index.ts'), CTX);
    });

    it('@shipping/orders resolves to shipping index', () => {
      const next = makeNext();
      createAliasMatcher(aliases)('@shipping/orders', CTX, next);
      expect(next).toHaveBeenCalledWith(fileUrl('/src/shipping/orders/index.ts'), CTX);
    });

    it('@users/core resolves to users/core index', () => {
      const next = makeNext();
      createAliasMatcher(aliases)('@users/core', CTX, next);
      expect(next).toHaveBeenCalledWith(fileUrl('/src/users/core/index.ts'), CTX);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-04 (known, not fixed here): bare aliases like @billing return dir
  // ---------------------------------------------------------------------------

  describe('BUG-04 — bare alias returns directory (known, ruta B)', () => {
    it.fails('@billing bare resolves to a file (not a directory) — BUG-04 unfixed', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({
        '@billing':   '/src/billing',
        '@billing/*': '/src/billing/*',
      });

      resolve('@billing', CTX, next);

      // This would require index-file discovery; that's BUG-04.
      // The resolver currently returns the bare directory path, which
      // Node cannot import as-is → this assertion will fail.
      expect(next).toHaveBeenCalledWith(
        fileUrl('/src/billing/index.ts'),
        CTX
      );
    });

    it.fails('@shared bare resolves to a file (not a directory) — BUG-04 unfixed', () => {
      const next = makeNext();
      const resolve = createAliasMatcher({ '@shared': '/src/shared' });
      resolve('@shared', CTX, next);
      expect(next).toHaveBeenCalledWith(fileUrl('/src/shared/index.ts'), CTX);
    });
  });

  // ---------------------------------------------------------------------------
  // Roadmap §12 — todo items
  // ---------------------------------------------------------------------------

  it.todo('@billing/orders/bill without extension in plain Node — not yet tested (roadmap §12)');
});
