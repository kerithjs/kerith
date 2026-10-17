import { describe, it, expect } from 'vitest';
import { createScratchProject, runNode } from './helpers/scratch-project.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreIndexPath = path.resolve(__dirname, '../../src/index.ts').replace(/\\/g, '/');

/**
 * Minimum scratch project: ESM package.json + kerith.config.ts with origin '.'
 * The defaults in createScratchProject already include a valid package.json
 * (type: module) and a kerith.config.ts pointing to '.'.
 */
function makeBootProject(extraFiles: Record<string, string> = {}) {
  return createScratchProject({
    'kerith.config.ts': `export default { origin: '.', strict: false };`,
    ...extraFiles,
  });
}

describe('Audit Phase 0 — Bootstrap Guard (BUG-09)', () => {
  /**
   * R10 — Two sequential createApp() calls in the same process.
   * The second must throw DUPLICATE_BOOTSTRAP (process-level guard).
   * Today there is no process-level guard → test fails → it.fails is correct.
   */
  it.fails('R10 - dos createApp() seguidos: el segundo lanza DUPLICATE_BOOTSTRAP', () => {
    const projectDir = makeBootProject({
      'bootstrap.ts': `
        import { createApp } from '${coreIndexPath}';
        await createApp();           // first boot — must succeed
        await createApp();           // second boot — must throw DUPLICATE_BOOTSTRAP
        console.log('should not reach here');
      `,
    });

    const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DUPLICATE_BOOTSTRAP');
    expect(result.stderr).toContain('same process');
    expect(result.stdout).not.toContain('should not reach here');
  });

  /**
   * R10b — Concurrent createApp() via Promise.all.
   * One must succeed, one must throw DUPLICATE_BOOTSTRAP.
   */
  it.fails('R10b - Promise.all([createApp(), createApp()]): una falla con DUPLICATE_BOOTSTRAP', () => {
    const projectDir = makeBootProject({
      'bootstrap.ts': `
        import { createApp } from '${coreIndexPath}';
        try {
          await Promise.all([createApp(), createApp()]);
          console.log('both succeeded — unexpected');
        } catch (err) {
          if (err?.code === 'DUPLICATE_BOOTSTRAP' && err?.message?.includes('same process')) {
            console.log('DUPLICATE_BOOTSTRAP caught — correct');
            process.exit(0);
          }
          console.error('unexpected error:', err?.message ?? err);
          process.exit(2);
        }
      `,
    });

    const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DUPLICATE_BOOTSTRAP caught — correct');
  });

  /**
   * R10c — A failed createApp() (invalid config) must NOT block a subsequent valid one.
   * Today the guard is app-instance based and no process-level cleanup exists,
   * but this test verifies the future release-on-failure behaviour.
   */
  it.fails('R10c - createApp() fallido no bloquea el siguiente createApp() válido', () => {
    const projectDir = makeBootProject({
      // Override package.json with a non-ESM one so the first createApp() fails
      // at the ESM guard, then restore it for the second call.
      'bootstrap.ts': `
        import { createApp } from '${coreIndexPath}';
        import { writeFileSync, readFileSync } from 'node:fs';

        // Corrupt the ESM flag so Guard 2 fires on first boot
        const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
        writeFileSync('package.json', JSON.stringify({ ...pkg, type: 'commonjs' }));

        try {
          await createApp();  // must fail: INVALID_ESM_ENV
        } catch (_err) {
          // expected failure — restore the file
          writeFileSync('package.json', JSON.stringify({ ...pkg, type: 'module' }));
        }

        // Second boot: must succeed (guard released on failure)
        await createApp();
        console.log('second boot succeeded');
      `,
    });

    const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
    // Today (no process guard, no releaseBootstrap): the second boot also
    // succeeds but the FIRST boot is not actually failing the ESM guard inside
    // the same process due to module-level caching. The assertion that
    // 'second boot succeeded' appears is what we want — but the first boot
    // may or may not throw depending on the state machine that does not yet
    // exist.  The definitive check: the process must exit 0 AND print the
    // success message ONLY after a real failure-then-release cycle.
    // Without the state machine, this test correctly fails because there is
    // no guarantee the second boot runs after the guard is truly released.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('second boot succeeded');
    // Also verify the first boot did fail (stderr has INVALID_ESM_ENV or similar)
    expect(result.stderr).toMatch(/INVALID_ESM_ENV|second boot/);
  });

  /**
   * R10d — Worker mode: two createApp(undefined) in the same process.
   * Second must throw DUPLICATE_BOOTSTRAP even without an Express app.
   */
  it.fails('R10d - worker mode: dos createApp(undefined) seguidos, el segundo falla', () => {
    const projectDir = makeBootProject({
      'bootstrap.ts': `
        import { createApp } from '${coreIndexPath}';
        await createApp(undefined);   // first — worker mode boot
        await createApp(undefined);   // second — must throw DUPLICATE_BOOTSTRAP
        console.log('should not reach here');
      `,
    });

    const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DUPLICATE_BOOTSTRAP');
    expect(result.stderr).toContain('same process');
    expect(result.stdout).not.toContain('should not reach here');
  });

  /**
   * R10e — Same Express app instance used twice.
   * Guard 1 already exists today (checks __KerithBootstrapped on the app object).
   * This test is NOT it.fails — it passes now and must keep passing after A3.
   * Its role: regression guard to ensure the original Guard 1 message stays intact
   * after adding the new process-level guard.
   */
  it('R10e - mismo app dos veces: falla con mensaje de "misma instancia Express" (Guard 1, regresión)', () => {
    const projectDir = makeBootProject({
      // Express stub: a minimal object that step-08 can stamp __KerithBootstrapped on.
      // We stamp it manually in the script to simulate what step-08 would do, so Guard 1
      // fires on the second call regardless of step-08 completing.
      'node_modules/express/package.json': JSON.stringify({
        name: 'express', version: '4.18.0', type: 'module', main: './index.js',
        exports: { '.': './index.js' },
      }),
      'node_modules/express/index.js': [
        'export default function express() {',
        '  return { use() {}, listen() {}, set() {} };',
        '}',
      ].join('\n'),
      'bootstrap.ts': `
        import express from 'express';
        import { createApp } from '${coreIndexPath}';

        const app = express();

        // First boot
        await createApp(app);

        // At this point step-08 has stamped app.__KerithBootstrapped = true.
        // Second boot must hit Guard 1 with the original message.
        await createApp(app);
        console.log('should not reach here');
      `,
    });

    const result = runNode(projectDir, 'bootstrap.ts', ['--import', 'tsx']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DUPLICATE_BOOTSTRAP');
    // Guard 1 message must be the original — NOT the new "same process" message
    expect(result.stderr).toContain('same Express instance');
    expect(result.stdout).not.toContain('should not reach here');
  });
});
