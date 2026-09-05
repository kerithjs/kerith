import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractIdentifierCall, extractMultipleIdentifierCalls, extractTopLevelIdentifier } from '../../src/cli/lib/ast-parser.js';

describe('ast-parser tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runWithTempFile = async (content: string, testFn: (filePath: string) => Promise<void> | void) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Kerith-ast-'));
    const filePath = path.join(tmpDir, 'index.ts');
    fs.writeFileSync(filePath, content);
    
    try {
      await testFn(filePath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('', async () => {
    await runWithTempFile(`
      import { Module } from '@kerith/core';
      Module('users', { imports: ['auth'] });
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Module');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('users');
      expect(res?.options).toEqual({ imports: ['auth'] });
    });
  });

  it('', async () => {
    await runWithTempFile(`
      import { Domain } from '@kerith/core';
      Domain('billing', { modules: ['payments'] });
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Domain');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('billing');
      expect(res?.options).toEqual({ modules: ['payments'] });
    });
  });

  it('', async () => {
    await runWithTempFile(`
      import { Module } from '@kerith/core';
      Module('core', { imports: [] });
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Domain'); // requesting Domain when it is Module
      expect(res).toBeNull();
    });
  });

  it('', async () => {
    await runWithTempFile(`
      export const utils = () => {};
      console.log('No identifiers here');
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Module');
      expect(res).toBeNull();
    });
  });

  it('', async () => {
    await runWithTempFile(`
      @Controller('/api', { rateLimit: 'strict', guards: ['jwt'] })
      export class MyController {}
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Controller');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('/api');
      expect(res?.options).toEqual({ rateLimit: 'strict', guards: ['jwt'] });
    });
  });

  it('', async () => {
    await runWithTempFile(`
      import type { SomeType } from "./types";
      // bad syntax that throws acorn parser Error
      @@@
      Service('TestService');
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Service');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('TestService');
    });
  });

  it('', async () => {
    await runWithTempFile(`
      import type { SomeType } from "./types";
      // bad syntax that throws acorn parser Error
      @@@
      Domain('billing');
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Domain');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('billing');
      expect(res?.options).toEqual({});
    });
  });

  it('', async () => {
    await runWithTempFile(`
      import { Domain, Module } from '@kerith/core';
      Domain('billing');
      Module('payments');
    `, async (filePath) => {
      const res = await extractTopLevelIdentifier(filePath);
      expect(res).toEqual({ type: 'Domain', name: 'billing', options: {} });
    });
  });

  it('', async () => {
    await runWithTempFile(`export const value = 42;`, async (filePath) => {
      expect(await extractTopLevelIdentifier(filePath)).toBeNull();
    });
  });

  it('', async () => {
    await runWithTempFile(`
      import type { SomeType } from "./types";
      // bad syntax that throws acorn parser Error
      @@@
      Module('payments', { imports: ['invoices'], foo: 'bar' });
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Module');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('payments');
      expect(res?.options).toEqual({ imports: ['invoices'], foo: 'bar' });
    });
  });

  // ── Fase 5.4 — Verification: @Controller decorator no longer triggers EMPTY_MODULE ──────────

  it('Fase 5.4: file with only @Controller decorator produces non-empty internalIdentifiers (no EMPTY_MODULE)', async () => {
    // Mirrors exactly what graph-builder.ts does: extractMultipleIdentifierCalls with
    // targetCallees = ['Service', 'Repository', 'Schema', 'Controller'].
    // Before Fase 5.2, acorn threw on the '@' character and the regex fallback happened
    // to match by accident. After Fase 5.2, the TS compiler fallback correctly finds the
    // CallExpression inside the Decorator node so internalIdentifiers is reliably non-empty
    // and detectEmptyModules (export-checker.ts:60) does NOT fire.
    const targetCallees = ['Service', 'Repository', 'Schema', 'Controller'];
    await runWithTempFile(`
      import { Controller, Get } from '@kerith/core';

      @Controller('/users')
      export class UsersController {
        @Get('/')
        list() {}
      }
    `, async (filePath) => {
      const results = await extractMultipleIdentifierCalls(filePath, targetCallees);
      // Must find at least the @Controller('/users') call.
      expect(results.length).toBeGreaterThan(0);
      const names = results.map(r => r.name);
      expect(names).toContain('/users');
    });
  });

  it('Fase 5.4: nested options in @Controller decorator are parsed without brace-truncation', async () => {
    // Validates the fix for the brace-truncation bug documented in Fase 5.0:
    // the old regex `{[^}]+}` stopped at the first '}' and returned garbage for
    // nested objects like { metadata: { guards: ['jwt'] } }.
    // The TS compiler path recurses correctly and returns the full nested structure.
    await runWithTempFile(`
      import { Controller } from '@kerith/core';

      @Controller('/x', { metadata: { guards: ['jwt'], rateLimit: 'strict' } })
      export class XController {}
    `, async (filePath) => {
      const res = await extractIdentifierCall(filePath, 'Controller');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('/x');
      // Nested object must be fully present — not truncated at the first '}'.
      expect(res?.options).toEqual({
        metadata: { guards: ['jwt'], rateLimit: 'strict' },
      });
    });
  });
});
