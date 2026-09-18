/**
 * 06-create-kerith-e2e.test.ts
 *
 * E2E matrix for `create-kerith`. Exercises all 13 generator branches:
 *   - core / app template
 *   - TypeScript / JavaScript language
 *   - All 5 channels individually (with and without optional flags)
 *   - All channels together
 *   - Route prefix
 *
 * Design rules:
 *  - Workspace tarballs are packed once in the outer beforeAll; this is the
 *    only network-free substitute for the real npm registry.
 *  - Each matrix entry gets its own describe(), named after `entry.name`, so
 *    test reporters show meaningful labels instead of index numbers.
 *  - `runCreateKerith` handles generation + install + sync in one call.
 *  - `runFixture` handles server boot + health-gate.
 *  - All servers are stopped in afterAll even if tests fail midway.
 *
 * Assertions per combination:
 *  1. /health (or / for app) returns 200.
 *  2. Registry contains expected module names.
 *  3. If channels were requested, channel stub files exist.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFixture, stopFixture, readRegistrySnapshot, runCreateKerith } from '../src/index.js';
import type { FixtureHandle, ScaffoldOptions } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, '../../../');

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

type MatrixEntry = Omit<ScaffoldOptions, 'tarballs'>;

const MATRIX: MatrixEntry[] = [
  // Core template
  { name: 'core/ts',                  template: 'core', language: 'ts', channels: [] },
  { name: 'core/js',                  template: 'core', language: 'js', channels: [] },

  // App template — no channels
  { name: 'app/ts',                   template: 'app', language: 'ts', channels: [] },
  { name: 'app/ts+prefix',            template: 'app', language: 'ts', channels: [], routePrefix: '/api/v1' },

  // App template — individual channels
  { name: 'app/ts+alias',             template: 'app', language: 'ts', channels: ['alias'] },
  { name: 'app/ts+middleware',        template: 'app', language: 'ts', channels: ['middleware'] },
  { name: 'app/ts+cron',             template: 'app', language: 'ts', channels: ['cron'] },
  { name: 'app/ts+worker(redis)',     template: 'app', language: 'ts', channels: ['worker'],  redis: true  },
  { name: 'app/ts+worker(no-redis)', template: 'app', language: 'ts', channels: ['worker'],  redis: false },
  { name: 'app/ts+gateway(socketio)',    template: 'app', language: 'ts', channels: ['gateway'], socketio: true  },
  // NOTE: gateway(no-socketio) is NOT boot-tested: Gateway() always requires socket.io at runtime.
  //       Its stub content is verified in the static section below.

  // App template — all channels
  { name: 'app/ts+all-channels',      template: 'app', language: 'ts', channels: ['alias', 'middleware', 'cron', 'worker', 'gateway'], redis: true, socketio: true },
  { name: 'app/js+all-channels',      template: 'app', language: 'js', channels: ['alias', 'middleware', 'cron', 'worker', 'gateway'], redis: true, socketio: true },
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('06-create-kerith-e2e', () => {
  let tarballs: Record<string, string>;

  beforeAll(() => {
    const scriptPath = path.resolve(__dirname, '../scripts/pack-workspace-tarballs.js');
    const raw = execSync(`node ${scriptPath}`, { encoding: 'utf8', cwd: MONOREPO_ROOT });
    tarballs = JSON.parse(raw);
  }, 60_000);

  afterAll(() => {
    // Cleanup tarballs directory once at the very end
    if (tarballs && Object.keys(tarballs).length > 0) {
      const coreTarball = tarballs['@kerith/core'];
      if (coreTarball) {
        const tarballDir = path.dirname(coreTarball);
        if (fs.existsSync(tarballDir)) {
          fs.rmSync(tarballDir, { recursive: true, force: true });
        }
      }
    }
  });

  for (const entry of MATRIX) {
    describe(entry.name, () => {
      let dir: string;
      let handle: FixtureHandle;
      let hasError = false;

      beforeAll(async () => {
        dir = await runCreateKerith({ ...entry, tarballs });
        handle = await runFixture(dir, { routePrefix: entry.routePrefix });
      }, 120_000);

      afterEach((ctx) => {
        if ((ctx.task.result?.state as string) === 'fail') {
          hasError = true;
        }
      });

      afterAll(async () => {
        if (handle?.child?.exitCode === null) {
          await stopFixture(handle.child);
        }
        
        if (!hasError && fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        } else if (hasError) {
          console.error(`\n[E2E] Fixture failed for ${entry.name}. Project kept at ${dir}`);
          if (handle) {
            console.error(`\n--- Server Logs (${entry.name}) ---`);
            console.error(handle.getLogs());
            console.error(`----------------------------------\n`);
          }
        }
      });

      // --- 1. Boot ---
      it('boots and responds to expected endpoints', async () => {
        const healthRes = await handle.http.get(`${entry.routePrefix || ''}/health`);
        expect(healthRes.status).toBe(200);
        const data = await healthRes.json();
        expect(data).toMatchObject({ status: 'ok' });

        if (entry.template === 'app') {
          const homeRes = await handle.http.get(`${entry.routePrefix || ''}/`);
          expect(homeRes.status).toBe(200);
          const text = await homeRes.text();
          expect(text).toContain('Hello World! Welcome to Kerith Express');
        }
      });

      // --- 2. Registry ---
      it('registry contains health module', () => {
        const registry = readRegistrySnapshot(dir);
        const names = registry.records.map(r => r.name);
        expect(names).toContain('health');
      });

      if (entry.template === 'app') {
        it('registry contains home module', () => {
          const registry = readRegistrySnapshot(dir);
          const names = registry.records.map(r => r.name);
          expect(names).toContain('home');
        });
      }

      if (entry.channels && entry.channels.length > 0) {
        it('registry contains channels module and preload references it', () => {
          // The NITS registry tracks domain-layer identifiers (Service/Repository/Schema).
          // Channel identifiers (Client/Worker/Cron/etc. from @kerith/identifiers) are
          // registered in runtime memory, not written to registry.json by design.
          // We verify: (1) the module is scanned, (2) preload.js references it.
          const registry = readRegistrySnapshot(dir);
          const channelMod = registry.records.find(r => r.name === 'channels');
          expect(channelMod).toBeDefined();

          // Preload must reference the channels module alias so stubs are resolved at runtime
          const preloadPath = path.join(dir, '.kerith', 'preload.js');
          const preloadContent = fs.readFileSync(preloadPath, 'utf8');
          expect(preloadContent).toContain('@modules/channels');
        });

        it('channel stub files exist', () => {
          const ext = entry.language === 'ts' ? 'ts' : 'js';
          const channelsDir = path.join(dir, 'src/modules/channels');
          const files = fs.readdirSync(channelsDir);
          // index.ts|js always present
          expect(files).toContain(`index.${ext}`);
          // each requested channel
          for (const ch of entry.channels!) {
            expect(files).toContain(`${ch}.${ext}`);
          }
        });

        // worker.ts content differs based on --redis flag
        if (entry.channels.includes('worker')) {
          it('worker stub reflects redis flag', () => {
            const ext = entry.language === 'ts' ? 'ts' : 'js';
            const workerPath = path.join(dir, `src/modules/channels/worker.${ext}`);
            const content = fs.readFileSync(workerPath, 'utf8');
            if (entry.redis) {
              expect(content).toContain('concurrency');
            } else {
              // redis disabled — concurrency option should not be there
              expect(content).not.toContain('concurrency');
            }
          });
        }

        // gateway.ts content differs based on --socketio flag
        if (entry.channels.includes('gateway')) {
          it('gateway stub reflects socketio flag', () => {
            const ext = entry.language === 'ts' ? 'ts' : 'js';
            const gwPath = path.join(dir, `src/modules/channels/gateway.${ext}`);
            const content = fs.readFileSync(gwPath, 'utf8');
            if (entry.socketio) {
              expect(content).toContain('namespace');
            } else {
              expect(content).not.toContain('namespace');
            }
          });
        }
      }

      if (entry.template === 'core') {
        it('registry does NOT contain channels module (core template)', () => {
          const registry = readRegistrySnapshot(dir);
          const names = registry.records.map(r => r.name);
          expect(names).not.toContain('channels');
        });
      }
    });
  }

  // ── Static-only tests (no boot required) ──────────────────────────────────
  // gateway(no-socketio): Gateway() always requires socket.io at runtime, so
  // booting without the package installed always crashes. We verify the stub
  // content only — the lack of 'namespace' in the generated file.
  describe('app/ts+gateway(no-socketio) [static]', () => {
    let dir: string;

    beforeAll(async () => {
      dir = await runCreateKerith({ name: 'app/ts+gateway(no-socketio)', template: 'app', language: 'ts', channels: ['gateway'], socketio: false, tarballs });
    }, 60_000);

    afterAll(() => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('gateway stub does NOT contain namespace when socketio=false', () => {
      const gwPath = path.join(dir, 'src/modules/channels/gateway.ts');
      const content = fs.readFileSync(gwPath, 'utf8');
      expect(content).not.toContain('namespace');
    });

    it('gateway stub file exists', () => {
      expect(fs.existsSync(path.join(dir, 'src/modules/channels/gateway.ts'))).toBe(true);
    });
  });
});
