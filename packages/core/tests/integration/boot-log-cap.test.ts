/**
 * @file tests/integration/boot-log-cap.test.ts
 *
 * Integration tests verifying that BootLogGate correctly caps log output
 * during bootstrap for modules and routes (decisions #2 and #3 of the
 * boot-log-limit feature).
 *
 * - Only 3 "Module loaded" lines are emitted for info/warn/error logLevel.
 * - Exactly one overflow summary line appears after modules.
 * - Only 3 route lines are emitted globally (not per-module).
 * - Exactly one overflow summary line appears after routes.
 * - With logLevel: 'debug' no overflow summary is emitted and all entities log.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/index.ts'),
).href;

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Generates a module + controller file pair for a given module name.
 * The controller exports a real Express-compatible router via `Router()` so
 * that step-08 can inspect its `.stack` and extract actual routes.
 */
function makeModuleFiles(name: string, sourceHref: string): Record<string, string> {
  return {
    [`src/modules/${name}/index.ts`]: `
      import { Module } from '${sourceHref}';
      Module('${name}');
    `,
    [`src/modules/${name}/${name}.routes.ts`]: `
      import { Controller } from '${sourceHref}';
      import { Router } from 'express';
      Controller('/${name}');
      const router = Router();
      router.get('/one',   (req, res) => res.json(1));
      router.get('/two',   (req, res) => res.json(2));
      router.post('/three',(req, res) => res.json(3));
      export default router;
    `,
  };
}

/** Runs createApp() in a fresh tmp dir, capturing log calls via a spy. */
const runCappedApp = async (
  extraConfig: string,
  tests: (logCalls: [string, string, Record<string, unknown>?][]) => void,
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-logcap-'));

  const files: Record<string, string> = {
    'kerith.config.js': `export default { ${extraConfig} };`,
    // 4 modules — enough to exceed the BOOT_LOG_LIMIT of 3
    ...makeModuleFiles('alpha',   sourceUrl),
    ...makeModuleFiles('beta',    sourceUrl),
    ...makeModuleFiles('gamma',   sourceUrl),
    ...makeModuleFiles('delta',   sourceUrl),
  };

  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));

  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

  const logCalls: [string, string, Record<string, unknown>?][] = [];
  const mockLogger = vi.fn((level: string, msg: string, meta?: Record<string, unknown>) => {
    logCalls.push([level, msg, meta]);
  });

  try {
    const mockApp = { use: vi.fn() };
    await createApp(mockApp as any, { logger: mockLogger as any });
    tests(logCalls);
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Boot Log Cap (BootLogGate integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Module log capping (logLevel: info) ─────────────────────────────────────

  describe('Module log capping — logLevel: info (default)', () => {
    it('emits exactly 3 "Module loaded" lines for 4 modules', async () => {
      await runCappedApp('strict: false', (calls) => {
        const moduleLoaded = calls.filter(
          ([, msg]) => msg.startsWith('Module loaded:'),
        );
        expect(moduleLoaded).toHaveLength(3);
      });
    });

    it('emits exactly one overflow summary line for modules', async () => {
      await runCappedApp('strict: false', (calls) => {
        const summaries = calls.filter(
          ([, msg]) => msg.includes('more module(s) loaded'),
        );
        expect(summaries).toHaveLength(1);
        // Summary must mention total: 4
        expect(summaries[0][1]).toContain('total: 4');
        // and overflow: 1
        expect(summaries[0][1]).toMatch(/and 1 more module/);
      });
    });
  });

  // ── Route log capping — global (not per-module) ─────────────────────────────

  describe('Route log capping — global cap, not per-module', () => {
    it('emits exactly 3 route lines total across all 4 modules', async () => {
      await runCappedApp('strict: false', (calls) => {
        // Route log lines have meta._module: 'router' and meta.path set.
        // Using meta avoids regex fragility from ANSI color codes in the message.
        const routeLines = calls.filter(
          ([, , meta]) => meta?._module === 'router' && typeof meta?.path === 'string',
        );
        expect(routeLines).toHaveLength(3);
      });
    });

    it('emits exactly one global route overflow summary', async () => {
      await runCappedApp('strict: false', (calls) => {
        const summaries = calls.filter(([, msg]) =>
          msg.includes('more route(s) mounted'),
        );
        expect(summaries).toHaveLength(1);
        // 4 modules × 3 routes = 12 total; 3 shown → 9 in overflow
        expect(summaries[0][1]).toContain('total: 12');
        expect(summaries[0][1]).toMatch(/and 9 more route/);
      });
    });

    it('overflow summary has no module context (global, not per-module)', async () => {
      await runCappedApp('strict: false', (calls) => {
        const summaries = calls.filter(([, msg]) =>
          msg.includes('more route(s) mounted'),
        );
        expect(summaries).toHaveLength(1);
        // The meta should NOT include a `module` field (was present in old per-module summary)
        const meta = summaries[0][2] ?? {};
        expect(meta).not.toHaveProperty('module');
      });
    });
  });

  // ── Debug mode — unlimited (no capping, no summary) ─────────────────────────

  describe('Debug mode — logLevel: debug', () => {
    it('logs all 4 "Module loaded" lines and no module overflow summary', async () => {
      await runCappedApp("logLevel: 'debug', strict: false", (calls) => {
        const moduleLoaded = calls.filter(([, msg]) =>
          msg.startsWith('Module loaded:'),
        );
        expect(moduleLoaded).toHaveLength(4);

        const summaries = calls.filter(([, msg]) =>
          msg.includes('more module(s) loaded'),
        );
        expect(summaries).toHaveLength(0);
      });
    });

    it('logs all 12 route lines and no route overflow summary', async () => {
      await runCappedApp("logLevel: 'debug', strict: false", (calls) => {
        // Same filter: use meta instead of string regex (ANSI-safe).
        const routeLines = calls.filter(
          ([, , meta]) => meta?._module === 'router' && typeof meta?.path === 'string',
        );
        expect(routeLines).toHaveLength(12);

        const summaries = calls.filter(([, msg]) =>
          msg.includes('more route(s) mounted'),
        );
        expect(summaries).toHaveLength(0);
      });
    });
  });
});
