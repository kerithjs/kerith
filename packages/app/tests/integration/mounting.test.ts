import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _resetExtensionStore } from '@kerith/core';
import { _resetAllChannels } from '@kerith/identifiers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeTmpProject(moduleName = 'test') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-mounting-'));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };');
  fs.symlinkSync(
    path.resolve(__dirname, '../../node_modules'),
    path.join(tmpDir, 'node_modules'),
    'junction',
  );
  const moduleDir = path.join(tmpDir, `src/modules/${moduleName}`);
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(
    path.join(moduleDir, 'index.ts'),
    `import { Module } from '@kerith/core'\nModule('${moduleName}')\n`,
  );
  return { tmpDir, moduleDir };
}

const SYMBOL_PREAMBLE = `
const KERITH_CONTROLLER = Symbol.for('kerith:controller');
const KERITH_ROUTES     = Symbol.for('kerith:routes');
`;

describe('Integration: class-based controller mounting (Fase 6.2)', () => {
  beforeEach(() => {
    _resetExtensionStore();
    _resetAllChannels();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetExtensionStore();
    _resetAllChannels();
  });

  it('6.2.1 — decorated class with multiple methods mounts and responds over real HTTP', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('items');

    fs.writeFileSync(
      path.join(moduleDir, 'items.ts'),
      SYMBOL_PREAMBLE + `
class ItemsController {
  list(req, res) { res.status(200).json([{ id: 1, name: 'Widget' }]); }
  create(req, res) { res.status(201).json({ id: 2, name: req.body?.name ?? 'New' }); }
}
ItemsController.prototype[KERITH_ROUTES] = [
  { method: 'get',  path: '/', handlerKey: 'list'   },
  { method: 'post', path: '/', handlerKey: 'create' },
];
ItemsController[KERITH_CONTROLLER] = {
  prefix: '/items',
  routes: ItemsController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default ItemsController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();
    app.use(express.json());

    try {
      await createApp(app as any, { logger: () => {} });

      const resGet = await request(app).get('/items');
      expect(resGet.status).toBe(200);
      expect(resGet.body).toEqual([{ id: 1, name: 'Widget' }]);

      const resPost = await request(app)
        .post('/items')
        .set('Content-Type', 'application/json')
        .send({ name: 'Gadget' });
      expect(resPost.status).toBe(201);
      expect(resPost.body).toMatchObject({ id: 2, name: 'Gadget' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('6.2.2 — class with @Controller only (no Controller() function) is synthesised by step-08 and mounts', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('orders');

    fs.writeFileSync(
      path.join(moduleDir, 'orders.ts'),
      SYMBOL_PREAMBLE + `
class OrdersController {
  list(req, res) { res.status(200).json({ orders: [] }); }
  detail(req, res) { res.status(200).json({ id: req.params.id }); }
}
OrdersController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/',    handlerKey: 'list'   },
  { method: 'get', path: '/:id', handlerKey: 'detail' },
];
OrdersController[KERITH_CONTROLLER] = {
  prefix: '/orders',
  routes: OrdersController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default OrdersController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      const resList = await request(app).get('/orders');
      expect(resList.status).toBe(200);
      expect(resList.body).toEqual({ orders: [] });

      const resDetail = await request(app).get('/orders/42');
      expect(resDetail.status).toBe(200);
      expect(resDetail.body).toMatchObject({ id: '42' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('6.2.3 — Guard() receives metadata.guards correctly from a decorated class controller', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('guarded');

    const { Guard } = await import('@kerith/identifiers');
    Guard('meta-capture-guard', (_req: any) => true, { message: 'blocked' });

    fs.writeFileSync(
      path.join(moduleDir, 'guarded.ts'),
      SYMBOL_PREAMBLE + `
class GuardedController {
  info(req, res) { res.status(200).json({ secure: true }); }
}
GuardedController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/', handlerKey: 'info' },
];
GuardedController[KERITH_CONTROLLER] = {
  prefix: '/guarded',
  routes: GuardedController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: { guards: ['meta-capture-guard'] },
};
export default GuardedController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp, getRegisteredMiddlewareResolvers } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      const resolvers = getRegisteredMiddlewareResolvers();
      const guardResolver = resolvers.find(r => r.phase === 'pre');
      expect(guardResolver).toBeDefined();

      const fakeCtrlEntry = {
        name: 'guarded',
        path: path.join(moduleDir, 'guarded.ts'),
        prefix: '/guarded',
        middlewares: [],
        enabled: true,
        metadata: { guards: ['meta-capture-guard'] },
      };
      const handlers = guardResolver!.getHandlers(fakeCtrlEntry as any);
      expect(Array.isArray(handlers)).toBe(true);
      expect(handlers.length).toBeGreaterThan(0);

      const res = await request(app).get('/guarded');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ secure: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('6.2.4 — precedence: Controller() function wins over @Controller decorator when both present', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('precedence');

    fs.writeFileSync(
      path.join(moduleDir, 'both.ts'),
      SYMBOL_PREAMBLE + `
import { Controller } from '@kerith/core';
import { Router } from 'express';

class BothController {
  hello(req, res) { res.status(200).json({ from: 'class' }); }
}
BothController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/', handlerKey: 'hello' },
];
BothController[KERITH_CONTROLLER] = {
  prefix: '/decorator-path',
  routes: BothController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};

// Controller() function call — registers prefix at import time.
// step-08 synthesis guard: !ctrlMeta is false → decorator synthesis skipped.
Controller('/function-path');

const router = Router();
router.get('/', (req, res) => res.status(200).json({ from: 'function' }));
export { BothController };
export default router;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      const resFunction = await request(app).get('/function-path');
      expect(resFunction.status).toBe(200);
      expect(resFunction.body).toEqual({ from: 'function' });

      const resDecorator = await request(app).get('/decorator-path');
      expect(resDecorator.status).toBe(404);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
