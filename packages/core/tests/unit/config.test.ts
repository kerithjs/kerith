import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, DEFAULTS } from '../../src/core/config.js';

describe('loadConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runInTmpDir = async (files: Record<string, string>, tests: (tmpDir: string) => Promise<void>) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Kerith-tests-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, name), content);
    }
    
    try {
      await tests(tmpDir);
    } finally {
      vi.restoreAllMocks();
      // Cleanup files
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('should return only defaults when no config file exists', async () => {
    await runInTmpDir({}, async () => {
      const config = await loadConfig();

      expect((config as any).modules).toBe((DEFAULTS as any).modules);
      expect(config.prefix).toBe(DEFAULTS.prefix);
      expect(config.strict).toBe(DEFAULTS.strict);
      expect(config.resolveAliases).toBe(DEFAULTS.resolveAliases);
      expect(typeof config.logger).toBe('function');
    });
  });

  it('should overwrite defaults dynamically with the config file values', async () => {
    // Generate JS file because running TS dynamically requires tsx / special loaders in pure Kerith run environment
    await runInTmpDir({
      'kerith.config.js': 'export default { prefix: "/file-prefix", strict: false };'
    }, async () => {
      const config = await loadConfig();
      expect(config.prefix).toBe('/file-prefix');
      expect(config.strict).toBe(false);
      // Fallback
      expect((config as any).modules).toBe((DEFAULTS as any).modules);
    });
  });

  it('should successfully read domains and shared layout keys strictly for v2.0.0 upgrades', async () => {
    await runInTmpDir({
      'kerith.config.js': 'export default { domains: "src/domains/*", shared: "src/shared/*" };'
    }, async () => {
      const config = await loadConfig();
      expect((config as any).domains).toBe("src/domains/*");
      expect((config as any).shared).toBe("src/shared/*");
      expect((config as any).modules).toBe((DEFAULTS as any).modules);
    });
  });

  it('should return all defaults when config file is empty', async () => {
    await runInTmpDir({
      'kerith.config.js': 'export default {};'
    }, async () => {
      const config = await loadConfig();
      expect((config as any).modules).toBe((DEFAULTS as any).modules);
      expect(config.prefix).toBe(DEFAULTS.prefix);
      expect(config.strict).toBe(DEFAULTS.strict);
      expect(config.resolveAliases).toBe(DEFAULTS.resolveAliases);
      expect(config.logLevel).toBe(DEFAULTS.logLevel);
      expect(config.logFormat).toBe(DEFAULTS.logFormat);
      expect(config.nits.enabled).toBe(DEFAULTS.nits.enabled);
      expect(config.requirePreloader).toBe(DEFAULTS.requirePreloader);
      expect((config as any).moduleLoadTimeoutMs).toBe((DEFAULTS as any).moduleLoadTimeoutMs);
    });
  });

  it('should parse v1.8.0 config fields correctly', async () => {
    await runInTmpDir({
      'kerith.config.js': 'export default { logLevel: "debug", moduleLoadTimeoutMs: 5000, requirePreloader: true, resolveAliases: false };'
    }, async () => {
      const config = await loadConfig();
      expect(config.logLevel).toBe('debug');
      expect((config as any).moduleLoadTimeoutMs).toBe(5000);
      expect(config.requirePreloader).toBe(true);
      expect(config.resolveAliases).toBe(false);
    });
  });

  it('should fallback and warn on invalid numeric/enum config fields', async () => {
    const loggerSpy = vi.fn();
    await runInTmpDir({
      'kerith.config.js': 'export default { logLevel: "invalid", logFormat: "yaml", rules: { moduleLoadTimeout: -1 } };'
    }, async () => {
      const config = await loadConfig({ logger: loggerSpy });
      
      expect(config.logLevel).toBe('info');
      expect(config.logFormat).toBe('auto');
      expect(config.rules.moduleLoadTimeout).toBe(30000);
      
      expect(loggerSpy).toHaveBeenCalledWith('warn', expect.stringContaining('Invalid logLevel'), expect.any(Object));
      expect(loggerSpy).toHaveBeenCalledWith('warn', expect.stringContaining('Invalid logFormat'), expect.any(Object));
      expect(loggerSpy).toHaveBeenCalledWith('warn', expect.stringContaining('rules.moduleLoadTimeout must be a positive number'), expect.any(Object));
    });
  });

  it('should fallback and warn on moduleLoadTimeoutMs: 0', async () => {
    const loggerSpy = vi.fn();
    await runInTmpDir({
      'kerith.config.js': 'export default { rules: { moduleLoadTimeout: 0 } };'
    }, async () => {
      const config = await loadConfig({ logger: loggerSpy });
      expect(config.rules.moduleLoadTimeout).toBe(30000);
      expect(loggerSpy).toHaveBeenCalledWith('warn', expect.stringContaining('rules.moduleLoadTimeout must be a positive number'), expect.any(Object));
    });
  });

  it('should use custom logger if provided, otherwise defaultLogHandler', async () => {
    await runInTmpDir({}, async () => {
      const customLogger = vi.fn();
      const configWithCustom = await loadConfig({ logger: customLogger });
      expect(configWithCustom.logger).toBe(customLogger);

      const configWithDefault = await loadConfig();
      expect(typeof configWithDefault.logger).toBe('function');
      expect(configWithDefault.logger).not.toBe(customLogger);
    });
  });

  it('should throw clear error context when config file has a syntax error', async () => {
    await runInTmpDir({
      'kerith.config.js': 'module.exports = { prefix: "/fail", invalid-syntax here };'
    }, async () => {
      await expect(loadConfig()).rejects.toThrowError(/\[System\] Failed to parse config at/);
    });
  });
});
