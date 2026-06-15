import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractModuleImports,
  extractRelativeCrossModuleImports,
  buildActiveAliasesFromConfig,
  getRegisteredAliases,
} from '../../src/cli/lib/import-scanner.js';
import { createRegistry } from '../../src/core/registry.js';

function writeTempFile(content: string, ext = '.ts'): string {
  const tmpPath = path.join(os.tmpdir(), `Kerith-cli-scanner-${Date.now()}-${Math.random()}${ext}`);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  return tmpPath;
}

describe('cli/lib/import-scanner — REGLA-22', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  it('excludes third-party @scopes when only @modules is active', () => {
    const code = [
      "import Foo from '@types/node';",
      "import Ui from '@vitest/ui';",
      "import auth from '@modules/auth';",
    ].join('\n');
    const p = writeTempFile(code, '.js');
    tmpFiles.push(p);

    const result = extractModuleImports(p, ['@modules']);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/auth');
  });

  it('includes custom config aliases when listed in activeAliases', () => {
    const code = [
      "import { db } from '@config/database';",
      "import { x } from '@nestjs/common';",
    ].join('\n');
    const p = writeTempFile(code);
    tmpFiles.push(p);

    const result = extractModuleImports(p, ['@modules', '@config']);
    expect(result.map(r => r.specifier)).toEqual(['@config/database']);
  });

  it('buildActiveAliasesFromConfig merges @modules with config aliases', () => {
    const aliases = buildActiveAliasesFromConfig({
      aliases: { '@middleware': './src/middleware' },
    });
    expect(aliases).toContain('@modules');
    expect(aliases).toContain('@middleware');
  });

  it('getRegisteredAliases returns registry keys without wildcards', () => {
    const registry = createRegistry();
    registry.registerAlias('@modules', '/abs/modules');
    registry.registerAlias('@modules/users', '/abs/modules/users');
    registry.registerAlias('@modules/users/*', '/abs/modules/users/*');
    registry.registerAlias('@config', '/abs/config');

    expect(getRegisteredAliases(registry)).toEqual(
      expect.arrayContaining(['@modules', '@modules/users', '@config']),
    );
    expect(getRegisteredAliases(registry)).not.toContain('@modules/users/*');
  });
});

// ─── N-52: Regex coverage for import type / export type / export * / dynamic ──
// Empirically verified 2026-06-15: all patterns below are captured correctly
// by the current IMPORT_REGEX. These tests lock the behaviour so a future
// regex change cannot silently regress any of them.
describe('cli/lib/import-scanner — N-52: TypeScript import syntax coverage', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  function scan(code: string, ext = '.ts'): string[] {
    const p = path.join(os.tmpdir(), `kerith-n52-${Date.now()}-${Math.random()}${ext}`);
    fs.writeFileSync(p, code, 'utf-8');
    tmpFiles.push(p);
    return extractModuleImports(p, ['@modules']).map(r => r.specifier);
  }

  it('captures standard named import', () => {
    expect(scan(`import { UserService } from '@modules/users'`))
      .toContain('@modules/users');
  });

  it('captures import type { ... } from (N-52 — type import)', () => {
    expect(scan(`import type { UserService } from '@modules/users'`))
      .toContain('@modules/users');
  });

  it('captures export type { ... } from (N-52 — type re-export)', () => {
    expect(scan(`export type { UserType } from '@modules/users'`))
      .toContain('@modules/users');
  });

  it('captures export type with multiple names', () => {
    expect(scan(`export type { A, B, C } from '@modules/users'`))
      .toContain('@modules/users');
  });

  it('captures export * from (barrel re-export)', () => {
    expect(scan(`export * from '@modules/users'`))
      .toContain('@modules/users');
  });

  it('captures export { ... } from (named re-export)', () => {
    expect(scan(`export { UserService } from '@modules/users'`))
      .toContain('@modules/users');
  });

  it('captures dynamic import() expression (N-52)', () => {
    expect(scan(`import('@modules/users')`))
      .toContain('@modules/users');
  });

  it('captures await import() in expression (N-52)', () => {
    expect(scan(`const mod = await import('@modules/users')`))
      .toContain('@modules/users');
  });

  it('captures import type across multiple lines', () => {
    const code = `import type\n  { UserService }\n  from '@modules/users'`;
    expect(scan(code)).toContain('@modules/users');
  });

  it('does NOT capture imports on commented-out lines (N-52 false-positive guard)', () => {
    const code = [
      `// import { X } from '@modules/users'`,
      `// export type { Y } from '@modules/users'`,
      `import { Z } from '@modules/auth'`, // real import — must appear
    ].join('\n');
    const result = scan(code);
    expect(result).not.toContain('@modules/users');   // commented — must be absent
    expect(result).toContain('@modules/auth');         // real — must be present
  });

  it('reports the correct line number for the captured import', () => {
    const code = [
      `import express from 'express'`,
      `import type { UserService } from '@modules/users'`,
    ].join('\n');
    const p = path.join(os.tmpdir(), `kerith-n52-line-${Date.now()}.ts`);
    fs.writeFileSync(p, code, 'utf-8');
    tmpFiles.push(p);
    const result = extractModuleImports(p, ['@modules']);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(2);
  });
});

describe('cli/lib/import-scanner — extractRelativeCrossModuleImports', () => {
  const tmpFiles: string[] = [];
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = '';
    }
  });

  it('detects ../ imports that escape the module directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Kerith-relative-'));
    const usersDir = path.join(tmpDir, 'src', 'modules', 'users');
    const paymentsDir = path.join(tmpDir, 'src', 'modules', 'payments');
    fs.mkdirSync(usersDir, { recursive: true });
    fs.mkdirSync(paymentsDir, { recursive: true });
    fs.writeFileSync(path.join(paymentsDir, 'payments.service.ts'), 'export class P {}');

    const serviceFile = path.join(usersDir, 'users.service.ts');
    fs.writeFileSync(
      serviceFile,
      "import { P } from '../payments/payments.service';\nimport { R } from './users.repository';",
    );
    tmpFiles.push(serviceFile);

    const cross = extractRelativeCrossModuleImports(serviceFile, usersDir);
    expect(cross.map(c => c.specifier)).toContain('../payments/payments.service');
    expect(cross.map(c => c.specifier)).not.toContain('./users.repository');
    expect(cross.find(c => c.specifier === '../payments/payments.service')?.line).toBe(1);
  });

  it('returns [] for missing file without throwing', () => {
    const log = vi.fn();
    const result = extractRelativeCrossModuleImports('/no/such/file.ts', '/module', log);
    expect(result).toEqual([]);
  });

  it('never throws on unreadable paths', () => {
    const log = vi.fn();
    expect(() =>
      extractRelativeCrossModuleImports('\0invalid', '/module', log),
    ).not.toThrow();
  });
});
