import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CacheManager } from '../../src/cache/bootstrap-cache.js';
import { MtimeValidator } from '../../src/cache/mtime-validator.js';

describe('CacheManager', () => {
  let tmpDir: string;
  let kerithDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-cache-test-'));
    kerithDir = path.join(tmpDir, '.kerith');
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('5.1.1 — CacheManager.read() retorna null si el archivo no existe', () => {
    expect(CacheManager.read()).toBeNull();
  });

  it('5.1.2 — CacheManager.read() returns null if JSON is invalid', () => {
    fs.mkdirSync(kerithDir, { recursive: true });
    fs.writeFileSync(path.join(kerithDir, 'bootstrap-cache.json'), 'not-json', 'utf-8');
    expect(CacheManager.read()).toBeNull();
  });

  it('5.1.3 — CacheManager.read() returns null if data is absent', () => {
    fs.mkdirSync(kerithDir, { recursive: true });
    fs.writeFileSync(
      path.join(kerithDir, 'bootstrap-cache.json'),
      JSON.stringify({ status: 'ok', version: '2.0.0' }),
      'utf-8'
    );
    expect(CacheManager.read()).toBeNull();
  });

  it('5.1.4 — CacheManager.write() crea el archivo con formato correcto', () => {
    const mockData = {
      domains: [],
      modules: [],
      submodules: [],
      shared: [],
      identifiers: [],
      aliases: [],
    };
    CacheManager.write(mockData, '2.0.0', 'abc12345');

    const cachePath = path.join(kerithDir, 'bootstrap-cache.json');
    expect(fs.existsSync(cachePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(content.version).toBe('2.0.0');
    expect(content.status).toBe('ok');
    expect(content.savedAt).toBeDefined();
    expect(content.cwd).toBe(tmpDir);
    expect(content.configHash).toBe('abc12345');
    expect(content.data).toEqual(mockData);
  });

  it('5.1.5 — CacheManager.write() uses atomic write (.tmp -> rename)', () => {
    const mockData = {
      domains: [],
      modules: [],
      submodules: [],
      shared: [],
      identifiers: [],
      aliases: [],
    };
    CacheManager.write(mockData, '2.0.0', 'abc12345');

    const cachePath = path.join(kerithDir, 'bootstrap-cache.json');
    const tmpPath = path.join(kerithDir, 'bootstrap-cache.tmp');

    expect(fs.existsSync(cachePath)).toBe(true);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('5.1.6 — CacheManager.pending() escribe {"status":"pending"}', () => {
    CacheManager.pending();
    const cachePath = path.join(kerithDir, 'bootstrap-cache.json');
    const content = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(content.status).toBe('pending');
  });

  it('5.1.7 — CacheManager.fail(error) escribe {"status":"failed","error":"..."}', () => {
    fs.mkdirSync(kerithDir, { recursive: true });
    CacheManager.fail('Some error message');
    const cachePath = path.join(kerithDir, 'bootstrap-cache.json');
    const content = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(content.status).toBe('failed');
    expect(content.error).toBe('Some error message');
  });

  it('5.1.8 — CacheManager.valid() retorna false si status no es ok', () => {
    const cachePending = { status: 'pending' as const, version: '2.0.0', data: {} as any };
    const cacheFailed = { status: 'failed' as const, version: '2.0.0', data: {} as any };
    expect(CacheManager.valid(cachePending, '2.0.0', 'hash')).toBe(false);
    expect(CacheManager.valid(cacheFailed, '2.0.0', 'hash')).toBe(false);
  });

  it('5.1.9 — CacheManager.valid() retorna false si version mismatch', () => {
    const cache = { status: 'ok' as const, version: '1.9.0', configHash: 'hash', cwd: tmpDir, data: {} as any };
    expect(CacheManager.valid(cache, '2.0.0', 'hash')).toBe(false);
  });

  it('5.1.10 — CacheManager.valid() retorna false si configHash mismatch', () => {
    const cache = { status: 'ok' as const, version: '2.0.0', configHash: 'oldHash', cwd: tmpDir, data: {} as any };
    expect(CacheManager.valid(cache, '2.0.0', 'newHash')).toBe(false);
  });
  it('5.1.11 — CacheManager.valid() returns false if cwd mismatch', () => {
    const cache = { status: 'ok' as const, version: '2.0.0', configHash: 'hash', cwd: '/other/directory', data: {} as any };
    expect(CacheManager.valid(cache, '2.0.0', 'hash')).toBe(false);
  });

  it('5.1.12 — CacheManager.valid() returns true when everything matches', () => {
    const cache = { status: 'ok' as const, version: '2.0.0', configHash: 'hash', cwd: tmpDir, data: {} as any };
    expect(CacheManager.valid(cache, '2.0.0', 'hash')).toBe(true);
  });

  it('5.1.13 — CacheManager.invalidate() elimina el archivo', () => {
    fs.mkdirSync(kerithDir, { recursive: true });
    const cachePath = path.join(kerithDir, 'bootstrap-cache.json');
    const tmpPath = path.join(kerithDir, 'bootstrap-cache.tmp');
    fs.writeFileSync(cachePath, '{}', 'utf-8');
    fs.writeFileSync(tmpPath, '{}', 'utf-8');

    CacheManager.invalidate();

    expect(fs.existsSync(cachePath)).toBe(false);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('5.1.14 — CacheManager.hashConfig() retorna no-config si el archivo no existe', () => {
    expect(CacheManager.hashConfig('/no/existe.ts')).toBe('no-config');
  });

  it('5.1.15 — CacheManager.hashConfig() retorna un string de 8 chars para un archivo existente', () => {
    const tempFile = path.join(tmpDir, 'test-config.ts');
    fs.writeFileSync(tempFile, 'export default {}', 'utf-8');
    const hash = CacheManager.hashConfig(tempFile);
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it('5.1.16 — CacheManager.hashConfig() produce hashes distintos para contenidos distintos', () => {
    const tempFile1 = path.join(tmpDir, 'test-config-1.ts');
    const tempFile2 = path.join(tmpDir, 'test-config-2.ts');
    fs.writeFileSync(tempFile1, 'export default { a: 1 }', 'utf-8');
    fs.writeFileSync(tempFile2, 'export default { b: 2 }', 'utf-8');
    const hash1 = CacheManager.hashConfig(tempFile1);
    const hash2 = CacheManager.hashConfig(tempFile2);
    expect(hash1).not.toBe(hash2);
  });
});

describe('MtimeValidator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-mtime-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createMockCache(modules: any[], savedAt: string): any {
    return {
      savedAt,
      data: { modules }
    };
  }

  it('5.2.1 — MtimeValidator.validate() returns toRescan: [] when no file changed', () => {
    const file1 = path.join(tmpDir, 'f1.ts');
    fs.writeFileSync(file1, 'data');
    const stat = fs.statSync(file1);
    
    // savedAt in the future (after creation)
    const savedAt = new Date(stat.mtimeMs + 1000).toISOString();
    
    const cache = createMockCache([{ domain: 'dom1', files: [file1], cachedSize: stat.size, cachedMtime: stat.mtimeMs }], savedAt);
    const result = MtimeValidator.validate(cache);
    
    expect(result.toRescan).toEqual([]);
  });

  it('5.2.2 — MtimeValidator.validate() includes domainKey when a file changed (mtime > savedAt)', () => {
    const file1 = path.join(tmpDir, 'f1.ts');
    fs.writeFileSync(file1, 'data');
    const stat = fs.statSync(file1);
    
    // savedAt in the past (before creation)
    const savedAt = new Date(stat.mtimeMs - 1000).toISOString();
    
    const cache = createMockCache([{ domain: 'dom1', files: [file1], cachedSize: stat.size, cachedMtime: stat.mtimeMs - 1000 }], savedAt);
    const result = MtimeValidator.validate(cache);
    
    expect(result.toRescan).toContain('dom1');
  });

  it('5.2.3 — MtimeValidator.validate() includes domainKey when cachedSize differs', () => {
    const file1 = path.join(tmpDir, 'f1.ts');
    fs.writeFileSync(file1, 'data');
    const stat = fs.statSync(file1);
    
    // savedAt in the future, but size differs
    const savedAt = new Date(stat.mtimeMs + 1000).toISOString();
    
    const cache = createMockCache([{ domain: 'dom1', files: [file1], cachedSize: stat.size + 100, cachedMtime: stat.mtimeMs }], savedAt);
    const result = MtimeValidator.validate(cache);
    
    expect(result.toRescan).toContain('dom1');
  });

  it('5.2.4 — MtimeValidator.validate() marks as dirty if a listed file does not exist', () => {
    const savedAt = new Date().toISOString();
    const cache = createMockCache([{ domain: 'dom1', files: ['/no/existe.ts'], cachedSize: 0, cachedMtime: 0 }], savedAt);
    const result = MtimeValidator.validate(cache);
    
    expect(result.toRescan).toContain('dom1');
  });

  it('5.2.5 — MtimeValidator.validate() groups modules by domain correctly', () => {
    const file1 = path.join(tmpDir, 'f1.ts');
    fs.writeFileSync(file1, 'data');
    const stat = fs.statSync(file1);
    
    const savedAt = new Date(stat.mtimeMs - 1000).toISOString(); // force rescan
    
    const cache = createMockCache([
      { domain: 'billing', files: [file1], cachedSize: stat.size, cachedMtime: stat.mtimeMs - 1000 },
      { domain: 'billing', files: ['/no/existe.ts'], cachedSize: 0, cachedMtime: 0 }
    ], savedAt);
    
    const result = MtimeValidator.validate(cache);
    
    expect(result.toRescan).toEqual(['billing']); // only once
  });

  it('5.2.6 — MtimeValidator.validate() uses "__flat__" for modules without domain', () => {
    const savedAt = new Date().toISOString();
    const cache = createMockCache([{ files: ['/no/existe.ts'], cachedSize: 0, cachedMtime: 0 }], savedAt); // flat module missing file
    const result = MtimeValidator.validate(cache);
    
    expect(result.toRescan).toContain('__flat__');
  });
});
