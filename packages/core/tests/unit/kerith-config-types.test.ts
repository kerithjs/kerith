import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  isValidAliasKey,
  RESERVED_ALIASES,
} from '../../src/config/kerith-config.types.js';

// ─── defineConfig ──────────────────────────────────────────────────────────────

describe('defineConfig()', () => {
  it('returns the same config object it receives', () => {
    const cfg = { prefix: '/api', strict: true };
    expect(defineConfig(cfg)).toBe(cfg);
  });

  it('works with an empty config', () => {
    expect(defineConfig({})).toEqual({});
  });

  it('preserves all provided fields', () => {
    const cfg = { origin: 'src', logLevel: 'debug' as const, resolveAliases: false };
    expect(defineConfig(cfg)).toEqual(cfg);
  });
});

// ─── isValidAliasKey ───────────────────────────────────────────────────────────

describe('isValidAliasKey()', () => {
  // Reserved aliases must be rejected
  it('returns false for @modules (reserved)', () => {
    expect(isValidAliasKey('@modules')).toBe(false);
  });

  it('returns false for @shared (reserved)', () => {
    expect(isValidAliasKey('@shared')).toBe(false);
  });

  it('returns false for bare "@"', () => {
    expect(isValidAliasKey('@')).toBe(false);
  });

  // Invalid format
  it('returns false when key does not start with @', () => {
    expect(isValidAliasKey('config')).toBe(false);
  });

  it('returns false when first char after @ is a digit', () => {
    expect(isValidAliasKey('@1invalid')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidAliasKey('')).toBe(false);
  });

  // Valid formats
  it('returns true for a valid single-segment alias like @cfg', () => {
    expect(isValidAliasKey('@cfg')).toBe(true);
  });

  it('returns true for an alias with dashes like @my-lib', () => {
    expect(isValidAliasKey('@my-lib')).toBe(true);
  });

  it('returns true for an alias with digits after the first letter like @lib2', () => {
    expect(isValidAliasKey('@lib2')).toBe(true);
  });

  it('returns true for a single-letter alias like @a', () => {
    expect(isValidAliasKey('@a')).toBe(true);
  });
});

// ─── RESERVED_ALIASES ─────────────────────────────────────────────────────────

describe('RESERVED_ALIASES', () => {
  it('contains @modules and @shared', () => {
    expect(RESERVED_ALIASES).toContain('@modules');
    expect(RESERVED_ALIASES).toContain('@shared');
  });
});

