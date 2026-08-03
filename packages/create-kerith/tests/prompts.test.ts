import { describe, it, expect } from 'vitest';
import { isValidNpmName, sanitizeProjectName } from '../src/prompts.js';

describe('prompts', () => {
  describe('isValidNpmName', () => {
    it('accepts valid npm names', () => {
      expect(isValidNpmName('my-app')).toBe(true);
      expect(isValidNpmName('@kerith/core')).toBe(true);
      expect(isValidNpmName('react-dom')).toBe(true);
      expect(isValidNpmName('lodash')).toBe(true);
      expect(isValidNpmName('my_app.js')).toBe(true);
    });

    it('rejects invalid npm names', () => {
      expect(isValidNpmName('My App')).toBe(false); // spaces, uppercase
      expect(isValidNpmName('my app')).toBe(false); // spaces
      expect(isValidNpmName('MyApp')).toBe(false); // uppercase
      expect(isValidNpmName('.my-app')).toBe(false); // starts with dot
      expect(isValidNpmName('_my-app')).toBe(false); // starts with underscore
      expect(isValidNpmName('my-app!')).toBe(false); // invalid character
    });
  });

  describe('sanitizeProjectName', () => {
    it('converts spaces to hyphens and lowercases', () => {
      expect(sanitizeProjectName('My App')).toBe('my-app');
    });

    it('removes invalid characters', () => {
      expect(sanitizeProjectName('My App! @#$')).toBe('my-app-@'); // @ is preserved but others removed
    });

    it('trims whitespace', () => {
      expect(sanitizeProjectName('  hello world  ')).toBe('hello-world');
    });

    it('leaves valid names untouched', () => {
      expect(sanitizeProjectName('my-awesome-app')).toBe('my-awesome-app');
      expect(sanitizeProjectName('@scope/package-name')).toBe('@scope/package-name');
    });
  });
});
