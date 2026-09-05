import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractIdentifierCall, extractTopLevelIdentifier } from '../../src/cli/lib/ast-parser.js';

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
});
