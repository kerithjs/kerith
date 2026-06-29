import { describe, it, expect } from 'vitest';
import { generateDomainId, isValidDomainId } from '../../src/nits/domain-id.js';

describe('Domain ID Primitives', () => {
  describe('generateDomainId', () => {
    it('should generate an ID with the correct format', () => {
      const id = generateDomainId();
      expect(id).toMatch(/^dom_[0-9a-f]{8}$/);
      expect(isValidDomainId(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const id1 = generateDomainId();
      const id2 = generateDomainId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('isValidDomainId', () => {
    it('should accept valid domain IDs', () => {
      expect(isValidDomainId('dom_12345678')).toBe(true);
      expect(isValidDomainId('dom_abcdef01')).toBe(true);
    });

    it('should reject invalid formats', () => {
      // Wrong prefix
      expect(isValidDomainId('mod_12345678')).toBe(false);
      // Empty string
      expect(isValidDomainId('')).toBe(false);
      // Wrong length (too short)
      expect(isValidDomainId('dom_1234567')).toBe(false);
      // Wrong length (too long)
      expect(isValidDomainId('dom_123456789')).toBe(false);
      // Invalid hex characters
      expect(isValidDomainId('dom_1234567g')).toBe(false);
    });
  });
});
