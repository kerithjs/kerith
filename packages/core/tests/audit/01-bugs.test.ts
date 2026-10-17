import { describe, it, expect } from 'vitest';
import { createScratchProject, runNode } from './helpers/scratch-project.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
// @ts-expect-error Node typings might be outdated or not have this experimental feature exported cleanly yet
import { registerHooks } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../src/cli/index.ts');
const coreIndexPath = path.resolve(__dirname, '../../src/index.ts').replace(/\\/g, '/');

function runCheck(cwd: string, flags = '') {
  try {
    const cmd = flags ? `npx tsx ${cliPath} check ${flags}` : `npx tsx ${cliPath} check`;
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return { status: 0, output: stdout };
  } catch (err: any) {
    return { status: err.status, output: err.stdout + '\n' + err.stderr };
  }
}

// Fase 0 - Tests that fail first (Contract enforcement)
describe('Audit Phase 0 - Resolution and Domain Validation', () => {
  const hasHooks = typeof registerHooks === 'function';

  // B2c observation: preload-hook.ts sorts aliases by length descending at
  // createResolveHook() time (line 16-17), so the array IS ordered correctly.
  // The hook itself does not re-sort — order comes from precomputed arrays.
  // This note is for the B2c roadmap item; no change needed here.

  describe('Resolution (R3, R8, R11)', () => {
    // BUG-02 (A1.2) fix verified in alias-matcher.test.ts (unit tests for the
    // pure createAliasMatcher function).  This test exercises Node-pure import
    // without any bootstrap — aliases are never registered in this process —
    // so it still fails (ruta B; requires hook activation via createApp or preload).
    it.fails('R3 - @billing/orders, @shipping/orders, @users/core resuelven en Node puro sin preload', () => {
      const projectDir = createScratchProject({
        'index.js': `
          import * as b from '@billing/orders';
          import * as s from '@shipping/orders';
          import * as u from '@users/core';
          console.log('OK');
        `
      });
      const result = runNode(projectDir, 'index.js');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('OK');
    });

    it.fails('R3 parcial - @billing, @shared, @modules pelados siguen fallando (BUG-04 ruta B)', () => {
      const projectDir = createScratchProject({
        'index.js': `
          import * as b from '@billing';
          import * as s from '@shared';
          import * as m from '@modules';
          console.log('OK');
        `
      });
      const result = runNode(projectDir, 'index.js');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('OK');
    });

    it.skipIf(!hasHooks)('R8 - con Client() registrado siguen resolviendo @modules/x y un alias de kerith.config', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: 'src',
            aliases: {
              '@utils': './shared/utils.ts'
            }
          };
        `,
        'src/.gitkeep': '',
        'shared/utils.ts': `export const util = true;`,
        'modules/x.ts': `export const x = true;`,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          await createApp({ modules: [], strict: false });
          // Alias resolver must be active now — import aliases
          const utils = await import('@utils');
          console.log('OK');
        `
      });
      
      const stdout = execSync('npx tsx bootstrap.ts', { cwd: projectDir, encoding: 'utf-8', stdio: 'pipe' });
      expect(stdout).toContain('OK');
    });

    it('R11 - import dentro de un JSDoc no entra al grafo (strict no lanza UNDECLARED_IMPORT)', () => {
      const projectDir = createScratchProject({
        'src/.gitkeep': '',
        'billing/index.ts': `
          export const config = {};
        `,
        'billing/feature.ts': `
          /**
           * @param {import('@shipping/orders').Order} order
           */
          export function doSomething(order) {}
        `,
        'shipping/orders.ts': `
          export type Order = { id: string };
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          import { config } from './billing/index.ts';
          createApp({ modules: [config], strict: true });
        `
      });
      let status = 0;
      try {
        execSync('npx tsx bootstrap.ts', { cwd: projectDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch (e: any) {
        status = e.status ?? 1;
        console.error('R11 Failed output:', e.stdout, e.stderr);
      }
      expect(status).toBe(0);
      
      // Test check
      const checkRes = runCheck(projectDir);
      if (checkRes.status !== 0) {
        console.error('R11 Check Failed output:', checkRes.output);
      }
      expect(checkRes.status).toBe(0);
      expect(checkRes.output).not.toContain('UNDECLARED_IMPORT');
    });
  });

  describe('Domain Boundaries (R12, R13a, R14, R15)', () => {
    it('R12 - ciclo a ↔ b dentro de un dominio lanza CIRCULAR_DEPENDENCY', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: '.',
            strict: true,
          };
        `,
        'billing/index.ts': `
          import { Domain } from 'kerith';
          Domain('billing');
        `,
        'billing/a/index.ts': `
          import { Module } from 'kerith';
          Module('a', { imports: ['b'] });
        `,
        'billing/a/use.ts': `
          import '@billing/b';
        `,
        'billing/b/index.ts': `
          import { Module } from 'kerith';
          Module('b', { imports: ['a'] });
        `,
        'billing/b/use.ts': `
          import '@billing/a';
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          await createApp(undefined as any);
        `
      });
      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CIRCULAR_DEPENDENCY');
      expect(result.stderr).toContain('billing/a -> billing/b -> billing/a');
    });

    it('R13a - @users/core, @modules/core y @users desde billing dan DOMAIN_BOUNDARY_VIOLATION en bootstrap y check con mismo mensaje', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: '.',
            strict: true,
          };
        `,
        'billing/index.ts': `
          import { Domain } from 'kerith';
          Domain('billing');
        `,
        'billing/orders/index.ts': `
          import { Module } from 'kerith';
          Module('orders');
        `,
        'billing/orders/bad.ts': `
          import '@users/core';
          import '@modules/core';
          import '@users';
        `,
        'users/index.ts': `
          import { Domain } from 'kerith';
          Domain('users');
        `,
        'users/core/index.ts': `
          import { Module } from 'kerith';
          Module('core');
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          await createApp(undefined as any);
        `
      });

      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);

      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(1);
      
      // Verify exact identical violation message in both check and bootstrap
      const expectedMessage = 'Domain boundary violation: module "orders" (domain: billing) imports from internal domain alias "@users/core" (domain: users).';
      expect(checkRes.output).toContain(expectedMessage);
      expect(result.stderr).toContain(expectedMessage);
      expect(result.stderr).toContain('DOMAIN_BOUNDARY_VIOLATION');
    });

    it('R14 - homónimos billing/orders y shipping/orders no mezclan violaciones en check', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: '.',
            strict: true,
          };
        `,
        'billing/index.ts': `
          import { Domain } from 'kerith';
          Domain('billing');
        `,
        'billing/orders/index.ts': `
          import { Module } from 'kerith';
          Module('orders');
        `,
        'billing/orders/service.ts': `
          import '@shipping/unrelated'; // Domain boundary violation for billing
        `,
        'shipping/index.ts': `
          import { Domain } from 'kerith';
          Domain('shipping');
        `,
        'shipping/orders/index.ts': `
          import { Module } from 'kerith';
          Module('orders');
        `,
        'shipping/orders/service.ts': `
          import '@billing/unrelated'; // Domain boundary violation for shipping
        `,
        'shipping/unrelated/index.ts': `
          import { Module } from 'kerith';
          Module('unrelated');
        `,
        'billing/unrelated/index.ts': `
          import { Module } from 'kerith';
          Module('unrelated');
        `
      });
      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);
      
      // Should clearly distinguish them, not group them under "orders" module name
      expect(checkRes.output).toContain('billing/orders');
      expect(checkRes.output).toContain('shipping/orders');
    });

    it('R15 - @otro pelado desde otro dominio es cross-domain en ambos (bootstrap y check)', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: '.',
            strict: true,
          };
        `,
        'billing/index.ts': `
          import { Domain } from 'kerith';
          Domain('billing');
        `,
        'billing/orders/index.ts': `
          import { Module } from 'kerith';
          Module('orders');
        `,
        'billing/orders/bad.ts': `
          import '@otro';
        `,
        'otro/index.ts': `
          import { Domain } from 'kerith';
          Domain('otro');
        `,
        'otro/mod/index.ts': `
          import { Module } from 'kerith';
          Module('mod');
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          await createApp(undefined as any);
        `
      });

      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);
      expect(checkRes.output).toMatch(/Domain boundary violation/i);

      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('DOMAIN_BOUNDARY_VIOLATION');
    });

    it('R12 (check) - ciclo a ↔ b dentro de un dominio es detectado por kerith check vía rules-engine', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: '.',
            strict: true,
          };
        `,
        'billing/index.ts': `
          import { Domain } from 'kerith';
          Domain('billing');
        `,
        'billing/a/index.ts': `
          import { Module } from 'kerith';
          Module('a', { imports: ['b'] });
        `,
        'billing/a/use.ts': `
          import '@billing/b';
        `,
        'billing/b/index.ts': `
          import { Module } from 'kerith';
          Module('b', { imports: ['a'] });
        `,
        'billing/b/use.ts': `
          import '@billing/a';
        `
      });
      const checkRes = runCheck(projectDir, '--strict');
      expect(checkRes.status).toBe(1);
      expect(checkRes.output).toMatch(/Circular dependency detected.*billing\/[ab] -> billing\/[ab] -> billing\/[ab]/);
    });

    it('Paridad - bootstrap strict y kerith check rechazan exactamente las mismas violaciones de frontera', () => {
      const projectDir = createScratchProject({
        'kerith.config.ts': `
          export default {
            origin: '.',
            strict: true,
          };
        `,
        'billing/index.ts': `
          import { Domain } from 'kerith';
          Domain('billing');
        `,
        'billing/orders/index.ts': `
          import { Module } from 'kerith';
          Module('orders');
        `,
        'billing/orders/service.ts': `
          import '@shipping/inventory';
        `,
        'shipping/index.ts': `
          import { Domain } from 'kerith';
          Domain('shipping');
        `,
        'shipping/inventory/index.ts': `
          import { Module } from 'kerith';
          Module('inventory');
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          await createApp(undefined as any);
        `
      });

      // 1. Check detects the violation in orders importing @shipping/inventory
      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);
      expect(checkRes.output).toMatch(/Domain boundary violation/i);
      expect(checkRes.output).toContain('@shipping/inventory');
      expect(checkRes.output).toContain('billing/orders');

      // 2. Bootstrap in strict mode also halts on the exact same violation
      const bootstrapRes = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(bootstrapRes.status).toBe(1);
      expect(bootstrapRes.stderr).toContain('DOMAIN_BOUNDARY_VIOLATION');
      expect(bootstrapRes.stderr).toContain('@shipping/inventory');
    });
  });
});
