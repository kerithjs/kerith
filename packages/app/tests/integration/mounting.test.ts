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
const KERITH_PARAMS     = Symbol.for('kerith:params');
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

  it('2.7.3-a — param decorators: @Body, @Param and @Res resolve to the correct values', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('paramtest');

    fs.writeFileSync(
      path.join(moduleDir, 'paramtest.ts'),
      SYMBOL_PREAMBLE + `
class ParamController {
  // index 0 → body, index 1 → param 'id', index 2 → res
  update(body, id, res) {
    res.status(200).json({ receivedBody: body, receivedId: id });
  }
}
ParamController.prototype[KERITH_ROUTES] = [
  { method: 'post', path: '/:id', handlerKey: 'update' },
];
ParamController.prototype[KERITH_PARAMS] = {
  update: [
    { index: 0, source: 'body',  key: undefined },
    { index: 1, source: 'param', key: 'id'      },
    { index: 2, source: 'res',   key: undefined },
  ],
};
ParamController[KERITH_CONTROLLER] = {
  prefix: '/param',
  routes: [
    { method: 'post', path: '/:id', handlerKey: 'update',
      params: ParamController.prototype[KERITH_PARAMS].update },
  ],
  middlewares: [],
  metadata: undefined,
};
export default ParamController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();
    app.use(express.json());

    try {
      await createApp(app as any, { logger: () => {} });

      const res = await request(app)
        .post('/param/42')
        .set('Content-Type', 'application/json')
        .send({ name: 'Kerith' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ receivedBody: { name: 'Kerith' }, receivedId: '42' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('2.7.3-b — gap handling: undecorated param at index 1 stays undefined, decorated params at 0 and 2 resolve correctly', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('gaptest');

    fs.writeFileSync(
      path.join(moduleDir, 'gaptest.ts'),
      SYMBOL_PREAMBLE + `
class GapController {
  // index 0 → body, index 1 → not decorated (gap), index 2 → query 'v'
  handler(body, _unused, v, res) {
    res.status(200).json({ body, v, unusedIsUndefined: _unused === undefined });
  }
}
GapController.prototype[KERITH_ROUTES] = [
  { method: 'post', path: '/', handlerKey: 'handler' },
];
GapController.prototype[KERITH_PARAMS] = {
  handler: [
    { index: 0, source: 'body',  key: undefined },
    { index: 2, source: 'query', key: 'v'        },
    { index: 3, source: 'res',   key: undefined  },
  ],
};
GapController[KERITH_CONTROLLER] = {
  prefix: '/gap',
  routes: [
    { method: 'post', path: '/', handlerKey: 'handler',
      params: GapController.prototype[KERITH_PARAMS].handler },
  ],
  middlewares: [],
  metadata: undefined,
};
export default GapController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();
    app.use(express.json());

    try {
      await createApp(app as any, { logger: () => {} });

      const res = await request(app)
        .post('/gap?v=hello')
        .set('Content-Type', 'application/json')
        .send({ x: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ body: { x: 1 }, v: 'hello', unusedIsUndefined: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('2.7.3-c — regression: Fase 1 route without param decorators still receives (req, res) normally', async () => {
    // Re-runs the exact same fixture as 6.2.1 to confirm no regression on routes
    // that go through the Fase-1 code path (handler.bind(instance) direct to Express).
    const { tmpDir, moduleDir } = makeTmpProject('regression');

    fs.writeFileSync(
      path.join(moduleDir, 'regression.ts'),
      SYMBOL_PREAMBLE + `
class RegressionController {
  list(req, res) { res.status(200).json({ ok: true }); }
}
RegressionController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/', handlerKey: 'list' },
];
RegressionController[KERITH_CONTROLLER] = {
  prefix: '/reg',
  routes: RegressionController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default RegressionController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      const res = await request(app).get('/reg');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('2.7.3-d — async handler with @Body() that throws propagates to Express 5 error handler', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('asyncerr');

    fs.writeFileSync(
      path.join(moduleDir, 'asyncerr.ts'),
      SYMBOL_PREAMBLE + `
class AsyncErrController {
  async create(body) {
    throw new Error('boom from async handler');
  }
}
AsyncErrController.prototype[KERITH_ROUTES] = [
  { method: 'post', path: '/', handlerKey: 'create' },
];
AsyncErrController.prototype[KERITH_PARAMS] = {
  create: [
    { index: 0, source: 'body', key: undefined },
  ],
};
AsyncErrController[KERITH_CONTROLLER] = {
  prefix: '/asyncerr',
  routes: [
    { method: 'post', path: '/', handlerKey: 'create',
      params: AsyncErrController.prototype[KERITH_PARAMS].create },
  ],
  middlewares: [],
  metadata: undefined,
};
export default AsyncErrController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();
    app.use(express.json());

    try {
      await createApp(app as any, { logger: () => {} });

      // Mount a global error handler so Express 5 has somewhere to forward the
      // rejected promise — without this the process would emit an unhandledRejection.
      app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ error: err.message });
      });

      const res = await request(app)
        .post('/asyncerr')
        .set('Content-Type', 'application/json')
        .send({ x: 1 });

      // Express 5 must have forwarded the rejection to the error handler.
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ error: 'boom from async handler' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ─── Fase 4.6 — Route-level middleware tests ──────────────────────────────

  it('4.6.1 — Guard() at route level: /public passes without token, /admin requires token', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('routeguard');

    const { Guard } = await import('@kerith/identifiers');
    Guard('jwt-route', (req: any) => req.headers?.authorization === 'Bearer valid-token');

    fs.writeFileSync(
      path.join(moduleDir, 'routeguard.ts'),
      SYMBOL_PREAMBLE + `
class RouteGuardController {
  public(req, res) { res.status(200).json({ route: 'public' }); }
  admin(req, res)  { res.status(200).json({ route: 'admin'  }); }
}
RouteGuardController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/public', handlerKey: 'public' },
  { method: 'get', path: '/admin',  handlerKey: 'admin', metadata: { guards: ['jwt-route'] } },
];
RouteGuardController[KERITH_CONTROLLER] = {
  prefix: '/api',
  routes: RouteGuardController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default RouteGuardController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      // /public — no guard, always 200
      const resPublic = await request(app).get('/api/public');
      expect(resPublic.status).toBe(200);
      expect(resPublic.body).toEqual({ route: 'public' });

      // /admin without token — guard rejects → 401
      const resAdminNoToken = await request(app).get('/api/admin');
      expect(resAdminNoToken.status).toBe(401);

      // /admin with valid token — guard passes → 200
      const resAdminWithToken = await request(app)
        .get('/api/admin')
        .set('Authorization', 'Bearer valid-token');
      expect(resAdminWithToken.status).toBe(200);
      expect(resAdminWithToken.body).toEqual({ route: 'admin' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4.6.2 — RateLimit() at route level: limited route rejects at 429, unlimited route always passes', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('routeratelimit');

    const { RateLimit } = await import('@kerith/identifiers');
    // Always-reject limiter for test purposes
    RateLimit('always-limited', (_req: any) => false, { message: 'Rate limit hit' });

    fs.writeFileSync(
      path.join(moduleDir, 'routeratelimit.ts'),
      SYMBOL_PREAMBLE + `
class RateLimitController {
  free(req, res)     { res.status(200).json({ route: 'free' }); }
  limited(req, res)  { res.status(200).json({ route: 'limited' }); }
}
RateLimitController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/free',    handlerKey: 'free'    },
  { method: 'get', path: '/limited', handlerKey: 'limited', metadata: { rateLimit: 'always-limited' } },
];
RateLimitController[KERITH_CONTROLLER] = {
  prefix: '/rl',
  routes: RateLimitController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default RateLimitController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      const resFree = await request(app).get('/rl/free');
      expect(resFree.status).toBe(200);

      const resLimited = await request(app).get('/rl/limited');
      expect(resLimited.status).toBe(429);
      expect(resLimited.body.error).toBe('Rate limit hit');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4.6.3 — Validate() at route level: invalid body → 400, valid body → 200 with coerced req.body', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('routevalidate');

    const { Validate } = await import('@kerith/identifiers');
    Validate('user-schema', {
      parse(data: any) {
        if (!data?.name || typeof data.name !== 'string') {
          throw new Error('name is required');
        }
        return { ...data, name: data.name.trim(), validated: true };
      },
    });

    fs.writeFileSync(
      path.join(moduleDir, 'routevalidate.ts'),
      SYMBOL_PREAMBLE + `
class ValidateController {
  create(req, res) { res.status(200).json({ body: req.body }); }
}
ValidateController.prototype[KERITH_ROUTES] = [
  { method: 'post', path: '/', handlerKey: 'create', metadata: { validate: 'user-schema' } },
];
ValidateController[KERITH_CONTROLLER] = {
  prefix: '/validate',
  routes: ValidateController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default ValidateController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();
    app.use(express.json());

    try {
      await createApp(app as any, { logger: () => {} });

      // Invalid body — no name field → 400
      const resBad = await request(app)
        .post('/validate')
        .set('Content-Type', 'application/json')
        .send({ age: 25 });
      expect(resBad.status).toBe(400);
      expect(resBad.body.error).toBe('Validation failed');

      // Valid body — name present → 200, body coerced (validated: true injected)
      const resOk = await request(app)
        .post('/validate')
        .set('Content-Type', 'application/json')
        .send({ name: '  Kerith  ' });
      expect(resOk.status).toBe(200);
      expect(resOk.body.body).toMatchObject({ name: 'Kerith', validated: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4.6.4 — regression: routes without route.metadata are completely unaffected (Fase 1/2/3 baseline)', async () => {
    // Re-runs the 6.2.1 fixture verbatim — confirms that resolveRouteMiddlewares
    // returns [] when route.metadata is absent, adding zero overhead.
    const { tmpDir, moduleDir } = makeTmpProject('no-meta-regression');

    fs.writeFileSync(
      path.join(moduleDir, 'nometa.ts'),
      SYMBOL_PREAMBLE + `
class NoMetaController {
  list(req, res) { res.status(200).json({ ok: true }); }
}
NoMetaController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/', handlerKey: 'list' },
];
NoMetaController[KERITH_CONTROLLER] = {
  prefix: '/nometa',
  routes: NoMetaController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: undefined,
};
export default NoMetaController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      const res = await request(app).get('/nometa');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4.6.5 — override not merge: route.metadata.guards replaces ctrl.metadata.guards at route scope only', async () => {
    const { tmpDir, moduleDir } = makeTmpProject('override-meta');

    const { Guard } = await import('@kerith/identifiers');
    // admin-guard: only passes for 'admin' header
    Guard('admin-guard', (req: any) => req.headers?.role === 'admin');
    // jwt-guard: only passes for 'jwt' header
    Guard('jwt-guard', (req: any) => req.headers?.role === 'jwt');

    fs.writeFileSync(
      path.join(moduleDir, 'override.ts'),
      SYMBOL_PREAMBLE + `
class OverrideController {
  // Both routes go through controller-level 'admin-guard' (step-08).
  // /extra also runs route-level 'jwt-guard' (Fase 4.4).
  base(req, res)  { res.status(200).json({ route: 'base'  }); }
  extra(req, res) { res.status(200).json({ route: 'extra' }); }
}
OverrideController.prototype[KERITH_ROUTES] = [
  { method: 'get', path: '/base',  handlerKey: 'base'  },
  { method: 'get', path: '/extra', handlerKey: 'extra', metadata: { guards: ['jwt-guard'] } },
];
OverrideController[KERITH_CONTROLLER] = {
  prefix: '/ov',
  routes: OverrideController.prototype[KERITH_ROUTES],
  middlewares: [],
  metadata: { guards: ['admin-guard'] },
};
export default OverrideController;
`,
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { createApp } = await import('../../src/index.js');
    const app = express();

    try {
      await createApp(app as any, { logger: () => {} });

      // /base: only admin-guard (controller level). role=admin passes, role=jwt fails.
      const baseAdmin = await request(app).get('/ov/base').set('role', 'admin');
      expect(baseAdmin.status).toBe(200);

      const baseJwt = await request(app).get('/ov/base').set('role', 'jwt');
      expect(baseJwt.status).toBe(401); // admin-guard blocks jwt role

      // /extra: admin-guard (controller) + jwt-guard (route). Both must pass.
      // role=admin only → jwt-guard at route level blocks → 401
      const extraAdmin = await request(app).get('/ov/extra').set('role', 'admin');
      expect(extraAdmin.status).toBe(401);

      // Neither header → admin-guard blocks immediately → 401
      const extraNone = await request(app).get('/ov/extra');
      expect(extraNone.status).toBe(401);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

