import { describe, it, expect } from 'vitest';
import {
  BOOT_LOG_LIMIT,
  BootLogGate,
} from '../../src/core/utils/boot-log-limit.js';

describe('BootLogGate', () => {
  // ── Constant ─────────────────────────────────────────────────────────────────

  it('BOOT_LOG_LIMIT is 3', () => {
    expect(BOOT_LOG_LIMIT).toBe(3);
  });

  // ── Info level (capped) ───────────────────────────────────────────────────────

  describe("logLevel 'info' — capped mode", () => {
    it('allows exactly the first 3 calls to next()', () => {
      const gate = new BootLogGate('info');
      expect(gate.next()).toBe(true);
      expect(gate.next()).toBe(true);
      expect(gate.next()).toBe(true);
      expect(gate.next()).toBe(false);
      expect(gate.next()).toBe(false);
    });

    it('total reflects every call regardless of cap', () => {
      const gate = new BootLogGate('info');
      gate.next(); gate.next(); gate.next(); gate.next(); gate.next();
      expect(gate.total).toBe(5);
    });

    it('overflow is 0 when total <= BOOT_LOG_LIMIT', () => {
      const gate = new BootLogGate('info');
      gate.next(); gate.next(); gate.next();
      expect(gate.overflow).toBe(0);
      expect(gate.hasOverflow).toBe(false);
    });

    it('overflow counts entities beyond BOOT_LOG_LIMIT', () => {
      const gate = new BootLogGate('info');
      // 3 in-cap + 2 over-cap = overflow of 2
      gate.next(); gate.next(); gate.next(); gate.next(); gate.next();
      expect(gate.overflow).toBe(2);
      expect(gate.hasOverflow).toBe(true);
    });

    it('hasOverflow is false when total is exactly at the limit', () => {
      const gate = new BootLogGate('info');
      gate.next(); gate.next(); gate.next();
      expect(gate.hasOverflow).toBe(false);
    });

    it('hasOverflow becomes true as soon as the 4th entity is counted', () => {
      const gate = new BootLogGate('info');
      gate.next(); gate.next(); gate.next();
      expect(gate.hasOverflow).toBe(false);
      gate.next();
      expect(gate.hasOverflow).toBe(true);
      expect(gate.overflow).toBe(1);
    });
  });

  // ── Warn / Error levels (also capped) ─────────────────────────────────────────

  describe("logLevel 'warn' — same cap as 'info'", () => {
    it('caps at BOOT_LOG_LIMIT like info', () => {
      const gate = new BootLogGate('warn');
      expect(gate.next()).toBe(true);
      expect(gate.next()).toBe(true);
      expect(gate.next()).toBe(true);
      expect(gate.next()).toBe(false);
    });

    it('reports overflow correctly', () => {
      const gate = new BootLogGate('warn');
      gate.next(); gate.next(); gate.next(); gate.next();
      expect(gate.overflow).toBe(1);
      expect(gate.hasOverflow).toBe(true);
    });
  });

  describe("logLevel 'error' — same cap as 'info'", () => {
    it('caps at BOOT_LOG_LIMIT', () => {
      const gate = new BootLogGate('error');
      gate.next(); gate.next(); gate.next();
      expect(gate.next()).toBe(false);
    });
  });

  // ── Debug level (unlimited) ───────────────────────────────────────────────────

  describe("logLevel 'debug' — unlimited mode", () => {
    it('every call to next() returns true regardless of count', () => {
      const gate = new BootLogGate('debug');
      for (let i = 0; i < 100; i++) {
        expect(gate.next()).toBe(true);
      }
    });

    it('overflow is always 0 even after many calls', () => {
      const gate = new BootLogGate('debug');
      for (let i = 0; i < 50; i++) gate.next();
      expect(gate.overflow).toBe(0);
    });

    it('hasOverflow is always false', () => {
      const gate = new BootLogGate('debug');
      for (let i = 0; i < 50; i++) gate.next();
      expect(gate.hasOverflow).toBe(false);
    });

    it('total still reflects actual count in debug mode', () => {
      const gate = new BootLogGate('debug');
      gate.next(); gate.next(); gate.next(); gate.next();
      expect(gate.total).toBe(4);
    });
  });

  // ── Multiple independent gates ────────────────────────────────────────────────

  it('two gates are independent — one does not affect the other', () => {
    const gateA = new BootLogGate('info');
    const gateB = new BootLogGate('info');

    // exhaust gateA
    gateA.next(); gateA.next(); gateA.next(); gateA.next();

    // gateB is untouched — first call should still be true
    expect(gateB.next()).toBe(true);
    expect(gateA.hasOverflow).toBe(true);
    expect(gateB.hasOverflow).toBe(false);
  });
});
