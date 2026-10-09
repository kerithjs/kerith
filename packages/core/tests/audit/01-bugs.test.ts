import { describe, it, expect } from 'vitest';
import { createScratchProject, runNode } from './helpers/scratch-project.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
// @ts-expect-error Node typings might be outdated or not have this experimental feature exported cleanly yet
import { registerHooks } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../../src/cli/index.ts');
const coreIndexPath = path.resolve(__dirname, '../../src/index.ts').replace(/\\/g, '/');

function runCheck(cwd: string) {
  try {
    const stdout = execSync(`npx tsx ${cliPath} check`, { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return { status: 0, output: stdout };
  } catch (err: any) {
    return { status: err.status, output: err.stdout + '\n' + err.stderr };
  }
}

// Fase 0 - Tests that fail first (Contract enforcement)
describe('Audit Phase 0 - Resolution and Domain Validation', () => {
  const hasHooks = typeof registerHooks === 'function';

  describe('Resolution (R3, R8, R11)', () => {
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

    it.fails('R11 - import dentro de un JSDoc no entra al grafo (strict no lanza UNDECLARED_IMPORT)', () => {
      const projectDir = createScratchProject({
        'billing/index.ts': `
          import { Module } from 'kerith';
          export const config = Module('billing');
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
      // Test bootstrap
      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(0);
      
      // Test check
      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(0);
      expect(checkRes.output).not.toContain('UNDECLARED_IMPORT');
    });
  });

  describe('Domain Boundaries (R12, R13a, R14, R15)', () => {
    it.fails('R12 - ciclo a ↔ b dentro de un dominio lanza CIRCULAR_DEPENDENCY', () => {
      const projectDir = createScratchProject({
        'billing/index.ts': `
          import { Module } from 'kerith';
          export const config = Module('billing');
        `,
        'billing/a.ts': `
          import { b } from './b.ts';
          export const a = b;
        `,
        'billing/b.ts': `
          import { a } from './a.ts';
          export const b = a;
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          import { config } from './billing/index.ts';
          createApp({ modules: [config], strict: true });
        `
      });
      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CIRCULAR_DEPENDENCY');
    });

    it.fails('R13a - @users/core, @modules/core y @users desde billing dan DOMAIN_BOUNDARY_VIOLATION en bootstrap y check con mismo mensaje', () => {
      const projectDir = createScratchProject({
        'billing/index.ts': `
          import { Module } from 'kerith';
          export const config = Module('billing');
        `,
        'billing/bad.ts': `
          import '@users/core';
          import '@modules/core';
          import '@users';
        `,
        'users/core.ts': `export const u = 1;`,
        'modules/core.ts': `export const m = 1;`,
        'users/index.ts': `export const idx = 1;`,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          import { config } from './billing/index.ts';
          createApp({ modules: [config], strict: true });
        `
      });

      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);
      expect(checkRes.output).toContain('DOMAIN_BOUNDARY_VIOLATION');

      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('DOMAIN_BOUNDARY_VIOLATION');
      
      // Mismo mensaje se puede verificar si ambos strings son parecidos
      // (Aquí lo asertamos de forma simple buscando el código de error)
    });

    it.fails('R14 - homónimos billing/orders y shipping/orders no mezclan violaciones en check', () => {
      const projectDir = createScratchProject({
        'billing/orders.ts': `
          import '@shipping/unrelated'; // Domain boundary violation for billing
        `,
        'shipping/orders.ts': `
          import '@billing/unrelated'; // Domain boundary violation for shipping
        `
      });
      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);
      
      // Should clearly distinguish them, not group them under "orders" module name
      expect(checkRes.output).toContain('billing/orders');
      expect(checkRes.output).toContain('shipping/orders');
    });

    it.fails('R15 - @otro pelado desde otro dominio es cross-domain en ambos (bootstrap y check)', () => {
      const projectDir = createScratchProject({
        'billing/index.ts': `
          import { Module } from 'kerith';
          export const config = Module('billing');
        `,
        'billing/bad.ts': `
          import '@otro';
        `,
        'otro/index.ts': `
          export const o = 1;
        `,
        'bootstrap.ts': `
          import { createApp } from '${coreIndexPath}';
          import { config } from './billing/index.ts';
          createApp({ modules: [config], strict: true });
        `
      });

      const checkRes = runCheck(projectDir);
      expect(checkRes.status).toBe(1);
      expect(checkRes.output).toContain('DOMAIN_BOUNDARY_VIOLATION');

      const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('DOMAIN_BOUNDARY_VIOLATION');
    });
  });
});
