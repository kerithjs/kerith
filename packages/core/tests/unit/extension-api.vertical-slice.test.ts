/**
 * @file tests/unit/extension-api.vertical-slice.test.ts
 *
 * Fase 3 — Vertical slice de validación de la Extension API
 *
 * Prueba los 4 canales de la Extension API de punta a punta contra un
 * bootstrap real de createApp(), usando providers falsos que confirman
 * que el pipeline los invoca en el momento correcto.
 *
 * No depende de @kerith/identifiers ni de @kerith/app — todo se registra
 * directamente contra @kerith/core/extension.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createApp } from '../../src/bootstrap/createApp.js';
import {
  registerAliasProvider,
  registerMiddlewareResolver,
  registerScheduleProvider,
  registerBindingProvider,
} from '../../src/extension/index.js';
import { _resetExtensionStore } from '../../src/extension/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

// ─── Test harness ─────────────────────────────────────────────────────────────

const runInTmpApp = async (
  files: Record<string, string>,
  tests: (tmpDir: string, app: any) => Promise<void>,
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-ext-test-'));

  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }

  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));

  const mockApp = { use: vi.fn() };
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

  try {
    await tests(tmpDir, mockApp);
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const baseAppStructure = {
  'kerith.config.js': `export default { prefix: '/api', strict: false };`,
  'src/modules/users/index.ts': `
    import { Module } from '{{SOURCE}}';
    Module('users');
  `,
  'src/modules/users/users.controller.ts': `
    import { Controller } from '{{SOURCE}}';
    Controller('/users');
    const fakeRouter = function() {};
    fakeRouter.use = function() {};
    fakeRouter.stack = [{ route: { path: '/list', methods: { get: true } } }];
    export default fakeRouter;
  `,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Extension API — Vertical Slice (Fase 3)', () => {
  afterEach(() => {
    _resetExtensionStore();
    vi.restoreAllMocks();
  });

  // ─── Canal: ScheduleProvider ─────────────────────────────────────────────

  it('[Schedule] after-bootstrap: execute() corre despues de que createApp() resuelve', async () => {
    const executeOrder: string[] = [];

    registerScheduleProvider({
      name: 'fake-after-bootstrap',
      timing: 'after-bootstrap',
      execute: async () => {
        executeOrder.push('schedule-executed');
      },
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      executeOrder.push('before-createApp');
      await createApp(app as any);
      executeOrder.push('after-createApp');
    });

    expect(executeOrder).toEqual([
      'before-createApp',
      'schedule-executed',
      'after-createApp',
    ]);
  });

  it('[Schedule] on-listen: execute() corre cuando se llama listen()', async () => {
    const executeOrder: string[] = [];

    registerScheduleProvider({
      name: 'fake-on-listen',
      timing: 'on-listen',
      execute: async () => {
        executeOrder.push('on-listen-executed');
      },
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      const kerith = await createApp(app as any);

      expect(executeOrder).toEqual([]);

      const mockServer = {
        close: vi.fn((cb: any) => cb()),
        on: vi.fn(),
        emit: vi.fn(),
      };

      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const shutdown = await kerith.listen(mockServer as any);

      expect(executeOrder).toEqual(['on-listen-executed']);
      await shutdown();
    });
  });

  it('[Schedule] on-shutdown: execute() corre durante la secuencia de apagado', async () => {
    const executeOrder: string[] = [];

    registerScheduleProvider({
      name: 'fake-on-shutdown',
      timing: 'on-shutdown',
      execute: async () => {
        executeOrder.push('on-shutdown-executed');
      },
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      const kerith = await createApp(app as any);

      const mockServer = {
        close: vi.fn((cb: any) => cb()),
        on: vi.fn(),
        emit: vi.fn(),
      };

      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const shutdown = await kerith.listen(mockServer as any);

      expect(executeOrder).toEqual([]);
      await shutdown();

      expect(executeOrder).toContain('on-shutdown-executed');
    });
  });

  // ─── Canal: BindingProvider ──────────────────────────────────────────────

  it('[Binding] bind() corre despues de que todos los modulos estan importados', async () => {
    const bindOrder: string[] = [];

    registerBindingProvider({
      name: 'fake-worker',
      kind: 'worker',
      bind: async () => {
        bindOrder.push('bind-executed');
      },
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      bindOrder.push('before-createApp');
      await createApp(app as any);
      bindOrder.push('after-createApp');
    });

    expect(bindOrder).toEqual([
      'before-createApp',
      'bind-executed',
      'after-createApp',
    ]);
  });

  // ─── Canal: MiddlewareResolver ───────────────────────────────────────────

  it('[Middleware] pre-resolver se inyecta en la cadena de app.use() antes del router', async () => {
    const preMiddlewareSpy = vi.fn((_req: any, _res: any, next: any) => next());

    registerMiddlewareResolver({
      phase: 'pre',
      priority: 10,
      resolve: (_ctrl) => [preMiddlewareSpy],
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      await createApp(app as any);

      expect(app.use).toHaveBeenCalled();

      const callArgs: any[] = app.use.mock.calls[0];
      expect(callArgs).toContain(preMiddlewareSpy);
    });
  });

  it('[Middleware] post-resolver se inyecta despues del router', async () => {
    const postMiddlewareSpy = vi.fn((_req: any, _res: any, next: any) => next());

    registerMiddlewareResolver({
      phase: 'post',
      priority: 5,
      resolve: (_ctrl) => [postMiddlewareSpy],
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      await createApp(app as any);

      expect(app.use).toHaveBeenCalled();

      const callArgs: any[] = app.use.mock.calls[0];
      const routerIndex = callArgs.findIndex(
        (arg: any) => arg && typeof arg.use === 'function' && Array.isArray(arg.stack),
      );
      const postIndex = callArgs.indexOf(postMiddlewareSpy);

      expect(postIndex).toBeGreaterThan(-1);
      expect(postIndex).toBeGreaterThan(routerIndex);
    });
  });

  it('[Middleware] priority ordena los resolvers: mayor priority corre primero en app.use()', async () => {
    const lowPriorityMw = vi.fn((_req: any, _res: any, next: any) => next());
    const highPriorityMw = vi.fn((_req: any, _res: any, next: any) => next());

    registerMiddlewareResolver({
      phase: 'pre',
      priority: 1,
      resolve: (_ctrl) => [lowPriorityMw],
    });

    registerMiddlewareResolver({
      phase: 'pre',
      priority: 100,
      resolve: (_ctrl) => [highPriorityMw],
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      await createApp(app as any);

      expect(app.use).toHaveBeenCalled();

      const callArgs: any[] = app.use.mock.calls[0];
      const highIdx = callArgs.indexOf(highPriorityMw);
      const lowIdx = callArgs.indexOf(lowPriorityMw);

      expect(highIdx).toBeGreaterThan(-1);
      expect(lowIdx).toBeGreaterThan(-1);
      expect(highIdx).toBeLessThan(lowIdx);
    });
  });

  // ─── Canal: AliasProvider ────────────────────────────────────────────────

  it('[Alias] AliasProvider registra el alias en el Kerith registry despues del bootstrap', async () => {
    const fakeFilePath = '/fake/path/to/db.client.ts';

    registerAliasProvider({
      prefix: 'client',
      name: 'db',
      filePath: fakeFilePath,
      resolve: () => ({ query: vi.fn() }),
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      const kerith = await createApp(app as any);

      const resolved = kerith.registry.resolveAlias('@client/db');
      expect(resolved).toBe(fakeFilePath);
    });
  });

  it('[Alias] AliasProvider aparece en getAllAliases() con el prefijo correcto', async () => {
    const fakeFilePath = '/fake/path/to/redis.client.ts';

    registerAliasProvider({
      prefix: 'client',
      name: 'redis',
      filePath: fakeFilePath,
      resolve: () => ({}),
    });

    await runInTmpApp(baseAppStructure, async (_tmpDir, app) => {
      const kerith = await createApp(app as any);

      const allAliases = kerith.registry.getAllAliases();
      expect(allAliases['@client/redis']).toBe(fakeFilePath);
    });
  });

  // ─── Store isolation ─────────────────────────────────────────────────────

  it('[Store] _resetExtensionStore() garantiza aislamiento entre tests', () => {
    registerBindingProvider({
      name: 'leftover-provider',
      kind: 'worker',
      bind: async () => {},
    });

    _resetExtensionStore();

    expect(() => {
      registerBindingProvider({
        name: 'leftover-provider',
        kind: 'worker',
        bind: async () => {},
      });
    }).not.toThrow();
  });
});
