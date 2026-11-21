import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as astParser from '../../src/cli/lib/ast-parser.js';
import {
  generateAliasTable,
  writeAliasTableFile,
  readAliasTableFile,
  selectAliasTarget,
  isRuntimeDistMode,
  computeDistPath,
  resolveTsConfigOptions,
} from '../../src/bootstrap/alias-table.js';
import { scanAliasDeclarations } from '../../src/bootstrap/alias-scan.js';
import { runVirtualAliases } from '../../src/bootstrap/steps/step-05b-virtual-aliases.js';
import { runCacheWrite } from '../../src/bootstrap/steps/step-09-cache-write.js';
import { getAliasRuntime, _resetAliasRuntime } from '../../src/aliases/runtime.js';
import { CacheManager, CACHE_SCHEMA_VERSION } from '../../src/cache/bootstrap-cache.js';
import { KERITH_VERSION } from '../../src/bootstrap/version.js';
import { createRegistry } from '../../src/core/registry.js';
import { buildCommand } from '../../src/cli/commands/build.js';
import { syncPreloadCommand } from '../../src/cli/commands/sync-preload.js';
import type { BootstrapContext } from '../../src/bootstrap/context.js';

describe('7.2 Tabla generada y caché de bootstrap (bootstrap/alias-table.ts)', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;
  let originalArgv: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-alias-table-test-'));
    originalEnv = process.env.NODE_ENV;
    originalArgv = [...process.argv];
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    _resetAliasRuntime();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.argv = originalArgv;
    _resetAliasRuntime();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function writeFile(relPath: string, content: string): string {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  // ─── 1. Tabla generada (D9) & tsconfig outDir calculation ───────────────────
  describe('Tabla generada (D9) y cálculo de dist', () => {
    it('calculates dist path when compilerOptions.outDir is present in tsconfig.json', () => {
      writeFile(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            rootDir: './src',
            outDir: './dist',
          },
        }),
      );

      const tsOptions = resolveTsConfigOptions(tmpDir);
      expect(tsOptions.outDir).toBe(path.resolve(tmpDir, 'dist'));
      expect(tsOptions.rootDir).toBe(path.resolve(tmpDir, 'src'));

      const srcFile = path.resolve(tmpDir, 'src/infrastructure/database.client.ts');
      const dist = computeDistPath(
        srcFile,
        tsOptions.outDir!,
        tsOptions.rootDir,
        path.resolve(tmpDir, 'src'),
        tmpDir,
      );
      expect(dist).toBe(
        path.resolve(tmpDir, 'dist/infrastructure/database.client.js').replace(/\\/g, '/'),
      );
    });

    it('generates alias-table with src, dist and deps', async () => {
      writeFile(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            rootDir: './src',
            outDir: './dist',
          },
        }),
      );
      writeFile(
        'src/config/app.config.ts',
        `import { Config } from '@kerith/identifiers';
         Config('app', () => ({ port: 3000 }));`,
      );
      writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         import appConfig from '@config/app';
         Client('db', () => ({ ok: true }));`,
      );

      const originPath = path.join(tmpDir, 'src');
      const tableFile = await generateAliasTable({ cwd: tmpDir, originPath });

      expect(tableFile.version).toBe(KERITH_VERSION);
      expect(tableFile.entries['config/app']).toBeDefined();
      expect(tableFile.entries['client/db']).toBeDefined();

      const dbEntry = tableFile.entries['client/db'];
      expect(dbEntry.src).toBe(path.resolve(tmpDir, 'src/infra/db.client.ts').replace(/\\/g, '/'));
      expect(dbEntry.dist).toBe(path.resolve(tmpDir, 'dist/infra/db.client.js').replace(/\\/g, '/'));
      expect(dbEntry.deps).toContain('config/app');
    });

    it('omits dist when tsconfig has no outDir', async () => {
      writeFile(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            // no outDir
          },
        }),
      );
      writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ ok: true }));`,
      );

      const originPath = path.join(tmpDir, 'src');
      const tableFile = await generateAliasTable({ cwd: tmpDir, originPath });

      expect(tableFile.entries['client/db']).toBeDefined();
      expect(tableFile.entries['client/db'].dist).toBeUndefined();
      expect(tableFile.entries['client/db'].src).toBe(
        path.resolve(tmpDir, 'src/infra/db.client.ts').replace(/\\/g, '/'),
      );
    });

    it('atomically writes and reads .kerith/alias-table.json', () => {
      const mockTable = {
        version: KERITH_VERSION,
        entries: {
          'client/db': {
            src: '/abs/src/infra/db.client.ts',
            dist: '/abs/dist/infra/db.client.js',
            deps: ['config/app'],
          },
        },
      };

      writeAliasTableFile(tmpDir, mockTable);
      const readBack = readAliasTableFile(tmpDir);

      expect(readBack).toEqual(mockTable);
    });
  });

  // ─── 2. Runtime Selection (dist vs src) ──────────────────────────────────────
  describe('Selección en runtime', () => {
    it('isRuntimeDistMode returns true when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      expect(isRuntimeDistMode(tmpDir)).toBe(true);
    });

    it('isRuntimeDistMode returns true when entrypoint is in custom outDir', () => {
      process.env.NODE_ENV = 'development';
      writeFile(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            outDir: './build',
          },
        }),
      );
      process.argv[1] = path.resolve(tmpDir, 'build/main.js');
      expect(isRuntimeDistMode(tmpDir)).toBe(true);
    });

    it('isRuntimeDistMode returns false in development / tsx outside dist/', () => {
      process.env.NODE_ENV = 'development';
      process.argv[1] = path.resolve(tmpDir, 'src/main.ts');
      expect(isRuntimeDistMode(tmpDir)).toBe(false);
    });

    it('selectAliasTarget returns src when isDist is false', () => {
      const entry = {
        src: '/abs/src/db.client.ts',
        dist: '/abs/dist/db.client.js',
      };
      const selected = selectAliasTarget('client/db', entry, false);
      expect(selected).toBe('/abs/src/db.client.ts');
    });

    it('selectAliasTarget returns dist when isDist is true and dist is present', () => {
      const entry = {
        src: '/abs/src/db.client.ts',
        dist: '/abs/dist/db.client.js',
      };
      const selected = selectAliasTarget('client/db', entry, true);
      expect(selected).toBe('/abs/dist/db.client.js');
    });

    it('selectAliasTarget throws ALIAS_NOT_FOUND when isDist is true and dist is absent', () => {
      const entry = {
        src: '/abs/src/db.client.ts',
        // dist omitted
      };

      expect(() => selectAliasTarget('client/db', entry, true)).toThrowError(
        expect.objectContaining({
          code: 'ALIAS_NOT_FOUND',
        }),
      );
    });
  });

  // ─── 3. Step 05b Direct Hit & Fallback with warning in production ────────────
  describe('Step 05b — Lectura directa y fallback', () => {
    it('uses generated alias-table.json directly without scanning when version matches', async () => {
      const mockTable = {
        version: KERITH_VERSION,
        entries: {
          'client/db': {
            src: path.resolve(tmpDir, 'src/infra/db.client.ts'),
            dist: path.resolve(tmpDir, 'dist/infra/db.client.js'),
            deps: [],
          },
        },
      };
      writeAliasTableFile(tmpDir, mockTable);

      const ctx: BootstrapContext = {
        cwd: tmpDir,
        options: {},
        registry: createRegistry(),
        config: { resolveAliases: true } as any,
      };

      await runVirtualAliases(ctx);
      const runtime = getAliasRuntime();

      expect(runtime.table.has('client/db')).toBe(true);
      expect(runtime.table.get('client/db')).toContain('src/infra/db.client.ts');
    });

    it('falls back to scan and warns in production when alias-table.json is missing', async () => {
      process.env.NODE_ENV = 'production';
      writeFile(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            rootDir: './src',
            outDir: './dist',
          },
        }),
      );
      writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ ok: true }));`,
      );

      const warnSpy = vi.fn();
      const ctx: BootstrapContext = {
        cwd: tmpDir,
        options: {},
        registry: createRegistry(),
        config: { resolveAliases: true } as any,
        log: { warn: warnSpy } as any,
      };

      await runVirtualAliases(ctx);
      const runtime = getAliasRuntime();

      // Warned about falling back to static scan in production
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('.kerith/alias-table.json not found or version mismatch'),
        expect.anything(),
      );

      // Successfully populated runtime table pointing to dist because NODE_ENV=production
      expect(runtime.table.has('client/db')).toBe(true);
      expect(runtime.table.get('client/db')).toContain('dist/infra/db.client.js');
    });

    it('throws ALIAS_NOT_FOUND in production if dist output cannot be computed', async () => {
      process.env.NODE_ENV = 'production';
      writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ ok: true }));`,
      );
      // No tsconfig.json -> no outDir

      const ctx: BootstrapContext = {
        cwd: tmpDir,
        options: {},
        registry: createRegistry(),
        config: { resolveAliases: true } as any,
      };

      await expect(runVirtualAliases(ctx)).rejects.toThrowError(
        expect.objectContaining({
          code: 'ALIAS_NOT_FOUND',
        }),
      );
    });
  });

  // ─── 4. Bootstrap cache incremental scanning (data.aliases) ────────────────
  describe('Bootstrap Cache — data.aliases & escaneo incremental', () => {
    it('saves alias declarations in bootstrap-cache.json via runCacheWrite with mtime and size', () => {
      const file = writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ ok: true }));`,
      );
      const stats = fs.statSync(file);

      const ctx: BootstrapContext = {
        cwd: tmpDir,
        options: {},
        registry: createRegistry(),
        cacheEnabled: true,
        configHash: 'hash123',
        scanResult: { domains: [], modules: [], submodules: [], shared: [] } as any,
        aliasScanEntries: [
          {
            prefix: 'client',
            name: 'db',
            key: 'client/db',
            filePath: file,
            deps: [],
          },
        ],
      };

      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      runCacheWrite(ctx);

      const cache = CacheManager.read();
      expect(cache).not.toBeNull();
      expect(cache?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
      expect(cache?.data?.aliases).toHaveLength(1);
      const cachedAlias = cache?.data?.aliases[0];
      expect(cachedAlias?.key).toBe('client/db');
      expect(cachedAlias?.mtimeMs).toBe(stats.mtimeMs);
      expect(cachedAlias?.size).toBe(stats.size);
    });

    it('re-uses unchanged files from cache and only re-parses changed files', async () => {
      const fileA = writeFile(
        'src/infra/a.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('a', () => ({ a: 1 }));`,
      );
      const fileB = writeFile(
        'src/infra/b.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('b', () => ({ b: 2 }));`,
      );

      const statsA = fs.statSync(fileA);
      const statsB = fs.statSync(fileB);

      // Initial cached aliases
      const cachedAliases = [
        {
          prefix: 'client',
          name: 'a',
          key: 'client/a',
          filePath: fileA,
          deps: [],
          mtimeMs: statsA.mtimeMs,
          size: statsA.size,
        },
        {
          prefix: 'client',
          name: 'b',
          key: 'client/b',
          filePath: fileB,
          deps: [],
          mtimeMs: statsB.mtimeMs,
          size: statsB.size,
        },
      ];

      // Modify fileB slightly (touch mtime and change content)
      const later = new Date(Date.now() + 2000);
      fs.writeFileSync(
        fileB,
        `import { Client } from '@kerith/identifiers';
         Client('b', () => ({ b: 999 }));`,
      );
      fs.utimesSync(fileB, later, later);

      // Spy on AST parser to prove unchanged fileA is never re-parsed
      const parseSpy = vi.spyOn(astParser, 'extractMultipleIdentifierCalls');

      const scan = await scanAliasDeclarations({
        originPath: path.join(tmpDir, 'src'),
        cachedAliases,
      });

      expect(scan.entries).toHaveLength(2);
      expect(scan.table.has('client/a')).toBe(true);
      expect(scan.table.has('client/b')).toBe(true);

      // fileB was modified -> parsed via AST
      expect(parseSpy).toHaveBeenCalledWith(path.resolve(fileB), expect.anything(), expect.anything());
      // fileA was unchanged -> NEVER parsed via AST!
      expect(parseSpy).not.toHaveBeenCalledWith(path.resolve(fileA), expect.anything(), expect.anything());
    });

    it('populates ctx.aliasScanEntries and writes non-empty data.aliases to cache when using generated alias-table.json', async () => {
      const srcFile = writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ ok: true }));`,
      );
      const mockTable = {
        version: KERITH_VERSION,
        entries: {
          'client/db': {
            src: srcFile,
            deps: [],
          },
        },
      };
      writeAliasTableFile(tmpDir, mockTable);

      const ctx: BootstrapContext = {
        cwd: tmpDir,
        options: {},
        registry: createRegistry(),
        cacheEnabled: true,
        configHash: 'hash123',
        config: { resolveAliases: true } as any,
        scanResult: { domains: [], modules: [], submodules: [], shared: [] } as any,
      };

      await runVirtualAliases(ctx);

      // Ensure Step 05b populated ctx.aliasScanEntries even on direct hit
      expect(ctx.aliasScanEntries).toBeDefined();
      expect(ctx.aliasScanEntries).toHaveLength(1);
      expect(ctx.aliasScanEntries![0].key).toBe('client/db');

      // Now execute Step 09 cache write
      runCacheWrite(ctx);

      const cache = CacheManager.read();
      expect(cache).not.toBeNull();
      expect(cache?.data?.aliases).toBeDefined();
      expect(cache?.data?.aliases).toHaveLength(1);
      expect(cache?.data?.aliases[0].key).toBe('client/db');
      expect(cache?.data?.aliases[0].mtimeMs).toBeGreaterThan(0);
    });

    it('discards old cache without schemaVersion or with mismatched schemaVersion without error', () => {
      const oldCache = {
        version: KERITH_VERSION,
        status: 'ok' as const,
        configHash: 'hash',
        cwd: tmpDir,
        data: { domains: [], modules: [], submodules: [], shared: [], identifiers: [], aliases: [] },
      };

      expect(CacheManager.valid(oldCache as any, KERITH_VERSION, 'hash')).toBe(false);

      const mismatchedCache = {
        ...oldCache,
        schemaVersion: 1,
      };

      expect(CacheManager.valid(mismatchedCache as any, KERITH_VERSION, 'hash')).toBe(false);

      const validCache = {
        ...oldCache,
        schemaVersion: CACHE_SCHEMA_VERSION,
      };

      expect(CacheManager.valid(validCache as any, KERITH_VERSION, 'hash')).toBe(true);
    });
  });

  // ─── 5. CLI commands — build & sync-preload ──────────────────────────────────
  describe('CLI Commands: kerith build & kerith sync-preload', () => {
    it('sync-preload writes .kerith/alias-table.json', async () => {
      writeFile('package.json', JSON.stringify({ name: 'test-app', type: 'module' }));
      writeFile('kerith.config.js', 'export default {}');
      writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ ok: true }));`,
      );

      const cmd = syncPreloadCommand();
      await cmd.parseAsync(['node', 'cli']);

      const tablePath = path.join(tmpDir, '.kerith', 'alias-table.json');
      expect(fs.existsSync(tablePath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(tablePath, 'utf-8'));
      expect(parsed.version).toBe(KERITH_VERSION);
      expect(parsed.entries['client/db']).toBeDefined();
    });

    it('build writes .kerith/alias-table.json with dist when outDir is configured', async () => {
      writeFile('package.json', JSON.stringify({ name: 'test-app', type: 'module' }));
      writeFile('kerith.config.js', 'export default {}');
      writeFile(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            rootDir: './src',
            outDir: './dist',
          },
        }),
      );
      writeFile(
        'src/config/app.config.ts',
        `import { Config } from '@kerith/identifiers';
         Config('app', () => ({ port: 3000 }));`,
      );

      const cmd = buildCommand();
      // Pass --no-tsc so it doesn't invoke real tsc compiler in test environment
      await cmd.parseAsync(['node', 'cli', '--no-tsc', '--silent']);

      const tablePath = path.join(tmpDir, '.kerith', 'alias-table.json');
      expect(fs.existsSync(tablePath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(tablePath, 'utf-8'));
      expect(parsed.version).toBe(KERITH_VERSION);
      expect(parsed.entries['config/app']).toBeDefined();
      expect(parsed.entries['config/app'].dist).toContain('dist/config/app.config.js');
    });
  });
});
