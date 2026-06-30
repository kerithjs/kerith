import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommand } from '../../src/cli/commands/check.js';
import * as configModule from '../../src/core/config.js';
import * as nitsStore from '../../src/nits/nits-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(__dirname, '../fixtures/quality-violations-app');

/**
 * Base config mock for the quality-violations-app fixture.
 * Mirrors a clean kerith.config.ts with rules: {} (all defaults).
 */
function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    modules: 'src/modules/*',
    prefix: '',
    aliases: {},
    strict: false,
    nits: { enabled: false },
    resolvedRules: {
      maxModuleDepth: 3,
      fanOutThreshold: 5,
      fanInThreshold: 5,
      maxModuleFiles: 30,
      maxSubModulesPerModule: 5,
      unusedExports: false,
      circularDependency: true,
      moduleLoadTimeout: 30000,
      emptyModule: true,
      stalePurgeCycles: 3,
    },
    ...overrides,
  };
}

describe('Quality Rules Integration Tests', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(fixturePath);
    vi.spyOn(nitsStore, 'loadNitsRegistry').mockResolvedValue(null);
    vi.spyOn(nitsStore, 'saveNitsRegistry').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Depth violations ───────────────────────────────────────────────────────

  describe('MODULE_DEPTH_EXCEEDED', () => {
    it('fixture con profundidad 4 → reporta MODULE_DEPTH_EXCEEDED en JSON', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(baseConfig() as any);

      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--format', 'json']);

      const jsonCall = logSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('"qualityWarnings"')
      );
      expect(jsonCall).toBeDefined();
      const json = JSON.parse(jsonCall![0]);
      const depthViolation = json.qualityWarnings.find(
        (v: any) => v.type === 'module-depth-exceeded'
      );
      expect(depthViolation).toBeDefined();
      expect(depthViolation.module).toBe('payments');
    });

    it('mismo fixture con maxModuleDepth: 5 → sin MODULE_DEPTH_EXCEEDED', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(
        baseConfig({ resolvedRules: { ...baseConfig().resolvedRules, maxModuleDepth: 5 } }) as any
      );

      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--format', 'json']);

      const jsonCall = logSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('"qualityWarnings"')
      );
      const json = JSON.parse(jsonCall![0]);
      const depthViolation = json.qualityWarnings.find(
        (v: any) => v.type === 'module-depth-exceeded'
      );
      expect(depthViolation).toBeUndefined();
    });

    it('mismo fixture con maxModuleDepth: null → sin MODULE_DEPTH_EXCEEDED', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(
        baseConfig({ resolvedRules: { ...baseConfig().resolvedRules, maxModuleDepth: null } }) as any
      );

      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--format', 'json']);

      const jsonCall = logSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('"qualityWarnings"')
      );
      const json = JSON.parse(jsonCall![0]);
      const depthViolation = json.qualityWarnings.find(
        (v: any) => v.type === 'module-depth-exceeded'
      );
      expect(depthViolation).toBeUndefined();
    });
  });

  // ─── Fan-in + Depth simultaneous ────────────────────────────────────────────

  describe('Multiple simultaneous quality warnings', () => {
    it('fixture con fan-in 6 → FAN_IN_HIGH y MODULE_DEPTH_EXCEEDED simultáneos', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(
        baseConfig({ resolvedRules: { ...baseConfig().resolvedRules, fanInThreshold: 5 } }) as any
      );

      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--format', 'json']);

      const jsonCall = logSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('"qualityWarnings"')
      );
      const json = JSON.parse(jsonCall![0]);
      const warnings: any[] = json.qualityWarnings;

      const fanIn = warnings.find((v) => v.type === 'fan-in-high');
      const depth = warnings.find((v) => v.type === 'module-depth-exceeded');

      expect(fanIn).toBeDefined();
      expect(fanIn.module).toBe('auth');
      expect(depth).toBeDefined();
    });
  });

  // ─── --strict / exit codes ──────────────────────────────────────────────────

  describe('exit codes', () => {
    it('kerith check sin --strict → exit 0 aunque haya quality warnings', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(baseConfig() as any);

      const cmd = checkCommand();
      await expect(
        cmd.parseAsync(['node', 'test', '--format', 'json'])
      ).resolves.not.toThrow();
    });

    it('kerith check con --strict → throws (exit 1) si hay quality warnings', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(
        baseConfig({ strict: true }) as any
      );

      const cmd = checkCommand();
      await expect(
        cmd.parseAsync(['node', 'test', '--format', 'json', '--strict'])
      ).rejects.toThrow(/violations found/i);
    });
  });

  // ─── JSON output ─────────────────────────────────────────────────────────────

  describe('--format json', () => {
    it('qualityWarnings está separado de violations en el JSON', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(baseConfig() as any);

      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--format', 'json']);

      const jsonCall = logSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('"qualityWarnings"')
      );
      expect(jsonCall).toBeDefined();
      const json = JSON.parse(jsonCall![0]);

      expect(json).toHaveProperty('violations');
      expect(json).toHaveProperty('qualityWarnings');
      expect(Array.isArray(json.violations)).toBe(true);
      expect(Array.isArray(json.qualityWarnings)).toBe(true);

      // System violations should not contain quality warning types
      const qualityTypes = new Set([
        'module-depth-exceeded', 'module-too-large', 'too-many-submodules',
        'fan-in-high', 'fan-out-high', 'unused-export', 'empty-module'
      ]);
      for (const v of json.violations) {
        expect(qualityTypes.has(v.type)).toBe(false);
      }
    });
  });

  // ─── --verbose ───────────────────────────────────────────────────────────────

  describe('--verbose', () => {
    it('--verbose → imprime la sección Rules con los valores de las reglas', async () => {
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue(baseConfig() as any);

      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--verbose']);

      // Check that Rules section header was printed
      const allOutput = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(allOutput).toContain('Rules');
      expect(allOutput).toContain('maxModuleDepth');
      expect(allOutput).toContain('fanInThreshold');
    });
  });
});
