import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanAliasDeclarations } from '../../src/bootstrap/alias-scan.js';
import { extractMultipleIdentifierCalls } from '../../src/cli/lib/ast-parser.js';
import { detectAliasViolations, detectViolations, ViolationType } from '../../src/cli/lib/violations.js';
import { KerithError } from '../../src/core/errors.js';
import type { ModuleGraph } from '../../src/cli/lib/graph-builder.js';

describe('7.1 Escaneo estático del canal alias (bootstrap/alias-scan.ts)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-alias-scan-test-'));
  });

  afterEach(() => {
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

  describe('ast-parser — extractMultipleIdentifierCalls with alias identifiers', () => {
    it('extracts alias identifier calls imported from @kerith/identifiers', async () => {
      const file = writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ connect: true }), { lazy: false });`,
      );

      const calls = await extractMultipleIdentifierCalls(file, ['Client']);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('db');
      expect(calls[0].callee).toBe('Client');
      expect(calls[0].prefix).toBe('client');
      expect(calls[0].options).toEqual({ lazy: false });
    });

    it('extracts alias identifier calls imported from @kerith/app', async () => {
      const file = writeFile(
        'src/config/app.config.ts',
        `import { Config } from '@kerith/app';
         Config('app', () => ({ port: 3000 }));`,
      );

      const calls = await extractMultipleIdentifierCalls(file, ['Config']);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('app');
      expect(calls[0].prefix).toBe('config');
    });

    it('ignores function with same name when NOT imported from @kerith/app or @kerith/identifiers', async () => {
      const file = writeFile(
        'src/infra/custom.client.ts',
        `function Client(name: string, factory: any) { return { name }; }
         Client('custom', () => ({}));`,
      );

      const calls = await extractMultipleIdentifierCalls(file, ['Client']);
      expect(calls).toHaveLength(0);
    });

    it('throws ALIAS_INVALID when the first argument is not a string literal', async () => {
      const file = writeFile(
        'src/infra/dynamic.client.ts',
        `import { Client } from '@kerith/identifiers';
         const dynamicName = 'my-client';
         Client(dynamicName, () => ({}));`,
      );

      await expect(
        extractMultipleIdentifierCalls(file, ['Client']),
      ).rejects.toThrowError(KerithError);

      try {
        await extractMultipleIdentifierCalls(file, ['Client']);
      } catch (err: any) {
        expect(err.code).toBe('ALIAS_INVALID');
        expect(err.message).toMatch(/non-literal name/);
        expect(err.message).toMatch(/Client/);
      }
    });

    it('warns on renamed alias imports (import { Client as K }) and does not extract', async () => {
      const warnMock = vi.fn();
      const file = writeFile(
        'src/infra/renamed.client.ts',
        `import { Client as K } from '@kerith/identifiers';
         K('renamed', () => ({}));`,
      );

      const calls = await extractMultipleIdentifierCalls(file, ['Client'], { warn: warnMock });
      expect(calls).toHaveLength(0);
      expect(warnMock).toHaveBeenCalled();
      expect(warnMock.mock.calls[0][0]).toMatch(/Renamed import of "Client"/);
    });

    it('does not warn for a renamed import from a non-Kerith package', async () => {
      const warnMock = vi.fn();
      const file = writeFile(
        'src/infra/foreign.client.ts',
        `import { Client as K } from 'my-lib';
         K('foreign', () => ({}));`,
      );

      const calls = await extractMultipleIdentifierCalls(file, ['Client'], { warn: warnMock });
      expect(calls).toHaveLength(0);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('strictLiteralName:false skips non-literal calls instead of throwing', async () => {
      const file = writeFile(
        'src/infra/dynamic.client.ts',
        `import { Client } from '@kerith/identifiers';
         const dynamicName = 'my-client';
         Client(dynamicName, () => ({}));`,
      );

      const calls = await extractMultipleIdentifierCalls(file, ['Client'], {
        strictLiteralName: false,
      });
      expect(calls).toHaveLength(0);
    });
  });

  describe('scanAliasDeclarations()', () => {
    it('discovers all alias types (.config, .client, .store, .provider, .adapter)', async () => {
      writeFile('src/config/app.config.ts', `import { Config } from '@kerith/identifiers'; Config('app', () => ({}));`);
      writeFile('src/infra/db.client.ts', `import { Client } from '@kerith/identifiers'; Client('db', () => ({}));`);
      writeFile('src/state/cart.store.ts', `import { Store } from '@kerith/identifiers'; Store('cart', () => ({}));`);
      writeFile('src/ext/email.provider.ts', `import { Provider } from '@kerith/identifiers'; Provider('email', () => ({}));`);
      writeFile('src/adapters/stripe.adapter.ts', `import { Adapter } from '@kerith/identifiers'; Adapter('stripe', () => ({}));`);

      const result = await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });

      expect(result.entries).toHaveLength(5);
      expect(result.table.get('config/app')).toContain('app.config.ts');
      expect(result.table.get('client/db')).toContain('db.client.ts');
      expect(result.table.get('store/cart')).toContain('cart.store.ts');
      expect(result.table.get('provider/email')).toContain('email.provider.ts');
      expect(result.table.get('adapter/stripe')).toContain('stripe.adapter.ts');
    });

    it('excludes node_modules, dist, .kerith and test files', async () => {
      writeFile('src/config/app.config.ts', `import { Config } from '@kerith/identifiers'; Config('app', () => ({}));`);
      writeFile('src/node_modules/bad.client.ts', `import { Client } from '@kerith/identifiers'; Client('bad-nm', () => ({}));`);
      writeFile('src/dist/bad.client.ts', `import { Client } from '@kerith/identifiers'; Client('bad-dist', () => ({}));`);
      writeFile('src/.kerith/bad.client.ts', `import { Client } from '@kerith/identifiers'; Client('bad-kerith', () => ({}));`);
      writeFile('src/tests/bad.client.test.ts', `import { Client } from '@kerith/identifiers'; Client('bad-test', () => ({}));`);
      writeFile('src/infra/foo.spec.ts', `import { Client } from '@kerith/identifiers'; Client('bad-spec', () => ({}));`);

      const result = await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].key).toBe('config/app');
    });

    it('pre-filter still reaches files whose only alias reference is a renamed import', async () => {
      const warnMock = vi.fn();
      writeFile(
        'src/infra/renamed.client.ts',
        `import { Client as K } from '@kerith/identifiers';
         K('renamed', () => ({}));`,
      );

      const result = await scanAliasDeclarations({
        originPath: path.join(tmpDir, 'src'),
        warn: warnMock,
      });

      expect(result.entries).toHaveLength(0);
      expect(warnMock).toHaveBeenCalled();
      expect(warnMock.mock.calls[0][0]).toMatch(/Renamed import of "Client"/);
    });

    it('throws DUPLICATE_EXTENSION_PROVIDER when the same alias is declared across different files', async () => {
      writeFile('src/infra/db1.client.ts', `import { Client } from '@kerith/identifiers'; Client('db', () => ({}));`);
      writeFile('src/infra/db2.client.ts', `import { Client } from '@kerith/identifiers'; Client('db', () => ({}));`);

      await expect(
        scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') }),
      ).rejects.toThrowError(KerithError);

      try {
        await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });
      } catch (err: any) {
        expect(err.code).toBe('DUPLICATE_EXTENSION_PROVIDER');
        expect(err.message).toMatch(/Alias "@client\/db" is declared in two different files/);
      }
    });

    it('throws DUPLICATE_ALIAS_IDENTIFIER when the same alias is declared twice in the same file', async () => {
      writeFile(
        'src/infra/db.client.ts',
        `import { Client } from '@kerith/identifiers';
         Client('db', () => ({ v: 1 }));
         Client('db', () => ({ v: 2 }));`,
      );

      await expect(
        scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') }),
      ).rejects.toThrowError(KerithError);

      try {
        await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });
      } catch (err: any) {
        expect(err.code).toBe('DUPLICATE_ALIAS_IDENTIFIER');
        expect(err.message).toMatch(/Alias "@client\/db" is declared more than once/);
      }
    });

    describe('Grafo de dependencias y detección de ciclos (0.5)', () => {
      it('builds dependency edges between aliases', async () => {
        writeFile(
          'src/config/app.config.ts',
          `import { Config } from '@kerith/identifiers';
           Config('app', () => ({ port: 3000 }));`,
        );
        writeFile(
          'src/infra/db.client.ts',
          `import { Client } from '@kerith/identifiers';
           import config from '@config/app';
           Client('db', () => ({ port: config.port }));`,
        );

        const result = await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });
        const dbEntry = result.entries.find((e) => e.key === 'client/db');
        expect(dbEntry).toBeDefined();
        expect(dbEntry!.deps).toContain('config/app');
      });

      it('detects direct 2-node cycle A -> B -> A and throws ALIAS_CIRCULAR', async () => {
        writeFile(
          'src/config/a.config.ts',
          `import { Config } from '@kerith/identifiers';
           import b from '@client/b';
           Config('a', () => ({ b }));`,
        );
        writeFile(
          'src/infra/b.client.ts',
          `import { Client } from '@kerith/identifiers';
           import a from '@config/a';
           Client('b', () => ({ a }));`,
        );

        await expect(
          scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') }),
        ).rejects.toThrowError(KerithError);

        try {
          await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });
        } catch (err: any) {
          expect(err.code).toBe('ALIAS_CIRCULAR');
          expect(err.message).toMatch(/Circular dependency detected between aliases/);
          expect(err.message).toMatch(/@config\/a/);
          expect(err.message).toMatch(/@client\/b/);
        }
      });

      it('detects 3-node cycle A -> B -> C -> A', async () => {
        writeFile(
          'src/config/a.config.ts',
          `import { Config } from '@kerith/identifiers';
           import b from '@client/b';
           Config('a', () => ({ b }));`,
        );
        writeFile(
          'src/infra/b.client.ts',
          `import { Client } from '@kerith/identifiers';
           import c from '@store/c';
           Client('b', () => ({ c }));`,
        );
        writeFile(
          'src/state/c.store.ts',
          `import { Store } from '@kerith/identifiers';
           import a from '@config/a';
           Store('c', () => ({ a }));`,
        );

        try {
          await scanAliasDeclarations({ originPath: path.join(tmpDir, 'src') });
          expect.unreachable('Should have thrown ALIAS_CIRCULAR');
        } catch (err: any) {
          expect(err.code).toBe('ALIAS_CIRCULAR');
          expect(err.message).toMatch(/Circular dependency detected between aliases/);
        }
      });
    });
  });

  describe('kerith check — detectAliasViolations() & boundary exclusion', () => {
    it('reports UNDECLARED_ALIAS violation for imports of undeclared @prefix/name', () => {
      const aliasScan = {
        entries: [],
        table: new Map<string, string>(),
      };

      const mockGraph: ModuleGraph = {
        modules: [
          {
            name: 'users',
            dirPath: '/src/modules/users',
            indexPath: '/src/modules/users/index.ts',
            declaredImports: [],
            actualImports: [
              { specifier: '@client/non-existent', file: '/src/modules/users/service.ts', line: 5 },
            ],
            internalIdentifiers: [],
            declaredExports: [],
          },
        ],
        domains: [],
        submodules: [],
      };

      const violations = detectAliasViolations({
        aliasScan,
        graph: mockGraph,
        cwd: tmpDir,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe(ViolationType.UNDECLARED_ALIAS);
      expect(violations[0].message).toMatch(/Undeclared alias import "@client\/non-existent"/);
    });

    it('suggests closest match when typo is made in alias import', () => {
      const aliasScan = {
        entries: [],
        table: new Map<string, string>([['client/database', '/src/infra/db.client.ts']]),
      };

      const mockGraph: ModuleGraph = {
        modules: [
          {
            name: 'users',
            dirPath: '/src/modules/users',
            indexPath: '/src/modules/users/index.ts',
            declaredImports: [],
            actualImports: [
              { specifier: '@client/databse', file: '/src/modules/users/service.ts', line: 5 },
            ],
            internalIdentifiers: [],
            declaredExports: [],
          },
        ],
        domains: [],
        submodules: [],
      };

      const violations = detectAliasViolations({
        aliasScan,
        graph: mockGraph,
        cwd: tmpDir,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].suggestion).toContain('Did you mean: @client/database');
    });

    it('does NOT treat @config/app or @client/db as cross-domain or module boundary violations in detectViolations()', () => {
      const mockGraph: ModuleGraph = {
        modules: [
          {
            name: 'billing',
            domain: 'finance',
            dirPath: '/src/modules/billing',
            indexPath: '/src/modules/billing/index.ts',
            declaredImports: [],
            actualImports: [
              { specifier: '@config/app', file: '/src/modules/billing/index.ts', line: 2 },
              { specifier: '@client/database', file: '/src/modules/billing/index.ts', line: 3 },
            ],
            internalIdentifiers: [],
            declaredExports: [],
          },
        ],
        domains: [
          {
            name: 'finance',
            dirPath: '/src/domains/finance',
            indexPath: '/src/domains/finance/index.ts',
            modules: [],
          },
        ],
        submodules: [],
      };

      const violations = detectViolations(mockGraph, tmpDir);
      // None of the alias imports should trigger DOMAIN_BOUNDARY_VIOLATION or PRIVATE_IMPORT
      expect(violations).toHaveLength(0);
    });
  });
});
