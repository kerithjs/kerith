import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments, extractModuleImports } from '../../src/cli/lib/import-scanner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function writeTmp(content: string, ext = '.ts'): string {
  const p = path.join(os.tmpdir(), `kerith-sc-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

// ---------------------------------------------------------------------------
// Unit tests for stripComments (state machine)
// ---------------------------------------------------------------------------
describe('stripComments — state machine (BUG-10)', () => {
  it('strips // line comments, preserves newlines', () => {
    const code = `const a = 1; // line comment\nconst b = 2;`;
    const result = stripComments(code);
    expect(result).toContain('const a = 1;');
    expect(result).not.toContain('line comment');
    // newline preserved — two lines remain
    expect(result.split('\n')).toHaveLength(2);
  });

  it('strips /* block */ single-line comment', () => {
    const result = stripComments(`const a = /* inline */ 1;`);
    expect(result).toContain('const a =');
    expect(result).toContain('1;');
    expect(result).not.toContain('inline');
  });

  it('strips multi-line /* … */ block comment, preserving newlines', () => {
    const code = `line1\n/*\n * JSDoc\n * @param x\n */\nline6`;
    const result = stripComments(code);
    expect(result.split('\n')).toHaveLength(6);
    expect(result).not.toContain('JSDoc');
    expect(result).not.toContain('@param');
    expect(result).toContain('line1');
    expect(result).toContain('line6');
  });

  it('does NOT strip /* inside a single-quoted string', () => {
    const code = `const glob = '**/*.ts'; // ok`;
    const result = stripComments(code);
    // The /* inside the string must survive untouched
    expect(result).toContain("'**/*.ts'");
  });

  it('does NOT strip // inside a double-quoted string', () => {
    const code = `const url = "http://example.com";`;
    const result = stripComments(code);
    expect(result).toContain('"http://example.com"');
  });

  it('does NOT strip /* inside a template literal', () => {
    const code = 'const s = `pattern: **/*.ts`;';
    const result = stripComments(code);
    expect(result).toContain('`pattern: **/*.ts`');
  });

  it('handles escape sequences in strings correctly', () => {
    const code = `const s = 'it\\'s fine /* not a comment */';`;
    const result = stripComments(code);
    // The /* inside the escaped-quote string must survive
    expect(result).toContain("'it\\'s fine /* not a comment */'");
  });

  it('preserves real import after multi-line block comment with correct line number', () => {
    const code = [
      '/* line 1',
      '   line 2',
      '   line 3 */',
      "import { Foo } from '@modules/foo';",
    ].join('\n');
    const result = stripComments(code);
    const lines = result.split('\n');
    // Line 4 (index 3) should still contain the import
    expect(lines[3]).toContain('@modules/foo');
  });
});

// ---------------------------------------------------------------------------
// Integration tests: extractModuleImports with stripComments applied
// ---------------------------------------------------------------------------
describe('extractModuleImports + stripComments integration (BUG-10)', () => {
  it('R11 — import inside JSDoc /** … */ is NOT reported', () => {
    const code = [
      '/**',
      " * @param {import('@billing/invoices').Invoice} inv",
      ' */',
      'export function doSomething(inv) {}',
    ].join('\n');
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@billing']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(0);
  });

  it('real import after a block comment retains its line number', () => {
    const code = [
      '/*',
      ' * block comment',
      ' */',
      "import { X } from '@modules/x';", // line 4
    ].join('\n');
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@modules']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(4);
  });

  it('string containing /* followed by a real import — import IS reported', () => {
    const code = [
      "const glob = '**/*.ts';",
      "import { Y } from '@modules/y';",
    ].join('\n');
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@modules']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/y');
  });

  it("'http://…' string does NOT corrupt parsing of subsequent lines", () => {
    const code = [
      'const url = "http://example.com";',
      "import { Z } from '@modules/z';",
    ].join('\n');
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@modules']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/z');
  });

  it('// import … (commented-out) is still ignored — regression N-52', () => {
    const code = [
      "// import { Secret } from '@modules/secret';",
      "import { Real } from '@modules/real';",
    ].join('\n');
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@modules']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/real');
  });

  it('dynamic import() is still detected', () => {
    const code = `const m = await import('@modules/dyn');`;
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@modules']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/dyn');
  });

  it('export … from is still detected', () => {
    const code = `export { Foo } from '@modules/re-export';`;
    const p = writeTmp(code);
    const result = extractModuleImports(p, ['@modules']);
    fs.unlinkSync(p);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/re-export');
  });
});
