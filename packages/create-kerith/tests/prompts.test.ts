import { describe, it, expect } from 'vitest';
import { isValidNpmName, sanitizeProjectName, validateChannels, runPrompts } from '../src/prompts.js';

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

  describe('validateChannels', () => {
    it('returns valid channels when all are implemented', () => {
      const result = validateChannels('alias,worker');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.channels).toEqual(['alias', 'worker']);
      }
    });

    it('rejects unknown channel names', () => {
      const result = validateChannels('alias,foo');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/foo/);
      }
    });

    it('rejects --channels when template is not app', () => {
      const result = validateChannels('alias', 'core');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/--channels requires --template app/);
      }
    });

    it('allows --channels when no template constraint is given', () => {
      const result = validateChannels('alias,middleware,cron,worker,gateway');
      expect(result.valid).toBe(true);
    });
  });

  describe('runPrompts (--yes / non-interactive)', () => {
    it('returns YES_DEFAULTS when only --yes is passed', async () => {
      const choices = await runPrompts({ yes: true });
      expect(choices.template).toBe('core');
      expect(choices.language).toBe('ts');
      expect(choices.channels).toEqual([]);
      expect(choices.redis).toBe(false);
      expect(choices.socketio).toBe(false);
      expect(choices.port).toBe(3000);
      expect(choices.routePrefix).toBe('');
      expect(choices.installDeps).toBe(true);
    });

    it('--yes --channels alias,worker produces the given channels and redis=false', async () => {
      const choices = await runPrompts({ yes: true, channels: ['alias', 'worker'] });
      expect(choices.channels).toEqual(['alias', 'worker']);
      expect(choices.redis).toBe(false); // not passed → default
    });

    it('--yes --channels alias,worker --redis produces redis=true', async () => {
      const choices = await runPrompts({ yes: true, channels: ['alias', 'worker'], redis: true });
      expect(choices.channels).toEqual(['alias', 'worker']);
      expect(choices.redis).toBe(true);
    });

    it('--yes --socketio produces socketio=true', async () => {
      const choices = await runPrompts({ yes: true, socketio: true });
      expect(choices.socketio).toBe(true);
    });

    it('--yes --template app produces template=app', async () => {
      const choices = await runPrompts({ yes: true, template: 'app' });
      expect(choices.template).toBe('app');
    });

    it('--yes --no-install produces installDeps=false', async () => {
      const choices = await runPrompts({ yes: true, noInstall: true });
      expect(choices.installDeps).toBe(false);
    });

    it('--yes --port 8080 produces port=8080', async () => {
      const choices = await runPrompts({ yes: true, port: 8080 });
      expect(choices.port).toBe(8080);
    });
  });
});
