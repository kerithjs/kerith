import { describe, it, expect } from 'vitest';
import { findCircularDependencies, canonicalizeCycle } from '../../src/core/utils/cycle-detector.js';

describe('cycle-detector', () => {
  describe('canonicalizeCycle', () => {
    it('handles trivial cycles', () => {
      expect(canonicalizeCycle([])).toEqual([]);
      expect(canonicalizeCycle(['a'])).toEqual(['a']);
    });

    it('rotates 2-node cycle so smallest is first', () => {
      expect(canonicalizeCycle(['billing/b', 'billing/a', 'billing/b'])).toEqual([
        'billing/a',
        'billing/b',
        'billing/a',
      ]);
      expect(canonicalizeCycle(['billing/a', 'billing/b', 'billing/a'])).toEqual([
        'billing/a',
        'billing/b',
        'billing/a',
      ]);
    });

    it('rotates 3-node cycle correctly', () => {
      expect(canonicalizeCycle(['c', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'a']);
      expect(canonicalizeCycle(['b', 'c', 'a', 'b'])).toEqual(['a', 'b', 'c', 'a']);
    });
  });

  describe('findCircularDependencies', () => {
    it('is deterministic regardless of map insertion order (b first vs a first)', () => {
      const mapBFirst = new Map<string, string[]>([
        ['billing/b', ['billing/a']],
        ['billing/a', ['billing/b']],
      ]);
      const mapAFirst = new Map<string, string[]>([
        ['billing/a', ['billing/b']],
        ['billing/b', ['billing/a']],
      ]);

      const cyclesB = findCircularDependencies(mapBFirst);
      const cyclesA = findCircularDependencies(mapAFirst);

      expect(cyclesB).toEqual([['billing/a', 'billing/b', 'billing/a']]);
      expect(cyclesA).toEqual([['billing/a', 'billing/b', 'billing/a']]);
    });
  });
});
