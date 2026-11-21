import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  computeDistPath,
  generateAliasTable,
  readAliasTableFile,
} from '../../src/bootstrap/alias-table.js';
import { generatePreloadFile } from '../../src/cli/lib/preload-generator.js';
import {
  initPreloadVirtualAliases,
  registerVirtualAliasHooks,
  isVirtualAliasHookRegistered,
  clearVirtualAliasHooks,
} from '../../src/preload/preload-hook.js';
import { getAliasRuntime, _resetAliasRuntime } from '../../src/aliases/runtime.js';
import { KERITH_VERSION } from '../../src/bootstrap/version.js';

describe('7.3 Preload and Top-Level Alias Channel', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-preload-test-'));
    _resetAliasRuntime();
    clearVirtualAliasHooks();
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    _resetAliasRuntime();
    clearVirtualAliasHooks();
    delete process.env.NODE_ENV;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('src → dist mapping (computeDistPath & generateAliasTable)', () => {
    it('maps non-trivial rootDir correctly: rootDir/config/app.ts -> outDir/config/app.js', () => {
      const srcFile = path.join(tmpDir, 'src', 'backend', 'config', 'app.ts');
      const outDir = path.join(tmpDir, 'dist');
      const rootDir = path.join(tmpDir, 'src', 'backend');

      const dist = computeDistPath(srcFile, outDir, rootDir, undefined, tmpDir);
      const expected = path.join(outDir, 'config', 'app.js').replace(/\\/g, '/');
      expect(dist).toBe(expected);
    });

    it('converts .mts to .mjs and .cts to .cjs', () => {
      const srcMts = path.join(tmpDir, 'src', 'client', 'db.mts');
      const srcCts = path.join(tmpDir, 'src', 'client', 'cache.cts');
      const outDir = path.join(tmpDir, 'dist');
      const originPath = path.join(tmpDir, 'src');

      const distMts = computeDistPath(srcMts, outDir, undefined, originPath, tmpDir);
      const distCts = computeDistPath(srcCts, outDir, undefined, originPath, tmpDir);

      expect(distMts).toBe(path.join(outDir, 'client', 'db.mjs').replace(/\\/g, '/'));
      expect(distCts).toBe(path.join(outDir, 'client', 'cache.cjs').replace(/\\/g, '/'));
    });

    it('omits dist when tsconfig has no outDir (bundler build)', async () => {
      // Create tsconfig without outDir
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
          },
        }),
      );

      const srcDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'app.config.ts'),
        `import { Config } from '@kerith/app';\nexport default Config('app', () => ({ port: 3000 }));\n`,
      );

      const tableFile = await generateAliasTable({
        cwd: tmpDir,
        originPath: path.join(tmpDir, 'src'),
      });

      expect(tableFile.entries['config/app']).toBeDefined();
      expect(tableFile.entries['config/app'].src).toBeDefined();
      expect(tableFile.entries['config/app'].dist).toBeUndefined();
    });
  });

  describe('generatePreloadFile() with aliasTable', () => {
    it('emits aliasTable inside preload.js and writes .kerith/alias-table.json', async () => {
      // Create tsconfig with outDir
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            outDir: './dist',
            rootDir: './src',
          },
        }),
      );

      const srcDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'app.config.ts'),
        `import { Config } from '@kerith/app';\nexport default Config('app', () => ({ port: 3000 }));\n`,
      );

      const mockConfig: any = {
        origin: 'src',
        aliases: {},
      };

      const preloadContent = await generatePreloadFile(mockConfig, KERITH_VERSION, tmpDir);

      // Verify preload.js embeds aliasTable
      expect(preloadContent).toContain('aliasTable: {');
      expect(preloadContent).toContain('"config/app"');
      expect(preloadContent).toContain('app.config.ts');
      expect(preloadContent).toContain('app.config.js');

      // Verify initPreloadVirtualAliases is imported and called
      expect(preloadContent).toContain('initPreloadVirtualAliases');
      expect(preloadContent).toContain(
        'initPreloadVirtualAliases(KERITH_PRELOAD_CONFIG.aliasTable, resolve(__dirname, \'..\'), KERITH_PRELOAD_CONFIG._version);',
      );

      // Verify .kerith/alias-table.json was written
      const tableOnDisk = readAliasTableFile(tmpDir);
      expect(tableOnDisk).not.toBeNull();
      expect(tableOnDisk?.version).toBe(KERITH_VERSION);
      expect(tableOnDisk?.entries['config/app']).toBeDefined();

      // Verify generated preload passes node --check
      const tmpPreloadFile = path.join(tmpDir, 'test-preload.mjs');
      fs.writeFileSync(tmpPreloadFile, preloadContent, 'utf8');
      expect(() => {
        execSync(`node --check "${tmpPreloadFile}"`, { stdio: 'pipe' });
      }).not.toThrow();
    });
  });

  describe('initPreloadVirtualAliases runtime behavior', () => {
    it('populates runtime table with src in development mode', () => {
      const aliasTable = {
        'config/app': {
          src: '/abs/src/config/app.ts',
          dist: '/abs/dist/config/app.js',
          deps: [],
        },
      };

      initPreloadVirtualAliases(aliasTable, tmpDir, KERITH_VERSION);

      const runtime = getAliasRuntime();
      expect(runtime.table.has('config/app')).toBe(true);
      expect(runtime.table.get('config/app')).toContain('/abs/src/config/app.ts');
      expect(isVirtualAliasHookRegistered()).toBe(true);
    });

    it('populates runtime table with dist in production mode', () => {
      process.env.NODE_ENV = 'production';
      const aliasTable = {
        'client/db': {
          src: '/abs/src/client/db.ts',
          dist: '/abs/dist/client/db.js',
          deps: [],
        },
      };

      initPreloadVirtualAliases(aliasTable, tmpDir, KERITH_VERSION);

      const runtime = getAliasRuntime();
      expect(runtime.table.has('client/db')).toBe(true);
      expect(runtime.table.get('client/db')).toContain('/abs/dist/client/db.js');
    });

    it('throws ALIAS_NOT_FOUND when dist is requested in production but entry lacks dist', () => {
      process.env.NODE_ENV = 'production';
      const aliasTable = {
        'client/db': {
          src: '/abs/src/client/db.ts',
          deps: [],
        },
      };

      try {
        initPreloadVirtualAliases(aliasTable, tmpDir, KERITH_VERSION);
        expect.unreachable('Should have thrown ALIAS_NOT_FOUND');
      } catch (err: any) {
        expect(err.code).toBe('ALIAS_NOT_FOUND');
        expect(err.message).toContain('has no compiled "dist" entry');
      }
    });

    it('warns when preload version mismatches KERITH_VERSION', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      initPreloadVirtualAliases({}, tmpDir, '1.4.0');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pre-loader version mismatch'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('kerith sync-preload'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('registerVirtualAliasHooks idempotency', () => {
    it('does not re-register if already registered by preload', () => {
      expect(isVirtualAliasHookRegistered()).toBe(false);

      registerVirtualAliasHooks();
      expect(isVirtualAliasHookRegistered()).toBe(true);

      // Second call (as by createApp) is idempotent
      registerVirtualAliasHooks();
      expect(isVirtualAliasHookRegistered()).toBe(true);
    });

    it('deregisters hooks when resolveAliases is false', () => {
      registerVirtualAliasHooks();
      expect(isVirtualAliasHookRegistered()).toBe(true);

      registerVirtualAliasHooks({ resolveAliases: false });
      expect(isVirtualAliasHookRegistered()).toBe(false);
    });
  });

  describe('Top-level import before createApp & independence from activateAliasResolver', () => {
    it('allows alias resolution before createApp runs and remains functional after activateAliasResolver', async () => {
      // 1. Simulate declaring file
      const configFile = path.join(tmpDir, 'app.config.ts');
      fs.writeFileSync(configFile, 'export default {};');

      const runtime = getAliasRuntime();
      runtime.registerTableEntry('config/app', configFile);

      // Declare factory simulating what the file does when evaluated
      runtime.declare({
        prefix: 'config',
        name: 'app',
        filePath: configFile,
        factory: () => ({ env: 'test', port: 8080 }),
      });

      // 2. Preload initializes virtual hooks
      initPreloadVirtualAliases(
        {
          'config/app': {
            src: configFile,
            deps: [],
          },
        },
        tmpDir,
        KERITH_VERSION,
      );

      expect(isVirtualAliasHookRegistered()).toBe(true);

      // 3. Top-level import before createApp: runtime.get('config/app') works!
      const configInstance = await runtime.get('config/app');
      expect(configInstance).toEqual({ env: 'test', port: 8080 });

      // 4. Verify activateAliasResolver when preloaded === true does not disrupt virtual hooks
      globalThis.__KERITH_PRELOAD_CONFIG__ = {
        modulesDir: tmpDir,
        aliases: {},
        preloaded: true,
        _version: KERITH_VERSION,
      };

      const { activateAliasResolver } = await import('../../src/aliases/resolver.js');
      const fakeLog: any = { debug: vi.fn(), warn: vi.fn() };

      await activateAliasResolver({}, {}, fakeLog);
      expect(fakeLog.debug).toHaveBeenCalledWith(
        expect.stringContaining('ESM alias hook skipped (handled by pre-loader)'),
        expect.anything(),
      );

      // 5. Virtual alias hooks continue to work seamlessly from live runtime.table
      const resolvedAgain = await runtime.get('config/app');
      expect(resolvedAgain).toEqual({ env: 'test', port: 8080 });

      delete (globalThis as any).__KERITH_PRELOAD_CONFIG__;
    });

    it('executes a real native Node.js top-level ESM import via --import ./.kerith/preload.mjs', () => {
      const coreDistIndex = path.resolve(import.meta.dirname, '../../dist/index.js');
      const preloadHookDist = path.resolve(import.meta.dirname, '../../dist/preload/preload-hook.js');

      // Create declaring file that declares config/app on evaluation
      const srcConfigDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(srcConfigDir, { recursive: true });
      const configFilePath = path.join(srcConfigDir, 'app.config.js');
      fs.writeFileSync(
        configFilePath,
        `import { getAliasRuntime } from '${coreDistIndex}';
getAliasRuntime().declare({
  prefix: 'config',
  name: 'app',
  filePath: '${configFilePath}',
  factory: () => ({ port: 3000, ok: true }),
});
`,
      );

      // Create .kerith/preload.mjs using built preload-hook
      const kerithDir = path.join(tmpDir, '.kerith');
      fs.mkdirSync(kerithDir, { recursive: true });

      const aliasTableJson = {
        'config/app': {
          src: configFilePath,
          deps: [],
        },
      };

      const preloadMjsContent = `
import { registerHooks } from 'node:module';
import { createResolveHook, initPreloadVirtualAliases } from '${preloadHookDist}';

const KERITH_PRELOAD_CONFIG = {
  modulesDir: '${tmpDir}',
  aliases: {},
  aliasTable: ${JSON.stringify(aliasTableJson)},
  preloaded: true,
  _version: '${KERITH_VERSION}',
};

globalThis.__KERITH_PRELOAD_CONFIG__ = KERITH_PRELOAD_CONFIG;

registerHooks({
  resolve: createResolveHook(KERITH_PRELOAD_CONFIG.aliases),
});

initPreloadVirtualAliases(KERITH_PRELOAD_CONFIG.aliasTable, '${tmpDir}', KERITH_PRELOAD_CONFIG._version);
`;
      const preloadMjsPath = path.join(kerithDir, 'preload.mjs');
      fs.writeFileSync(preloadMjsPath, preloadMjsContent, 'utf8');

      // Run real native node subprocess importing @config/app before any createApp()
      const execScript = `import cfg from '@config/app'; console.log('REAL_TOP_LEVEL:' + JSON.stringify(cfg));`;

      const stdout = execSync(
        `"${process.execPath}" --import "${preloadMjsPath}" -e "${execScript}"`,
        {
          cwd: tmpDir,
          encoding: 'utf8',
        },
      );

      expect(stdout).toContain('REAL_TOP_LEVEL:{"port":3000,"ok":true}');
    });
  });
});
