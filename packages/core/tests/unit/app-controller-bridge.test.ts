import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import supertest from 'supertest';
import { buildRouterFromClass } from '../../src/bootstrap/steps/app-controller-bridge.js';
import { addMiddlewareResolver, _resetExtensionStore } from '../../src/extension/store.js';

describe('buildRouterFromClass()', () => {
  beforeEach(() => {
    _resetExtensionStore();
  });

  afterEach(() => {
    _resetExtensionStore();
  });

  it('throws when meta or meta.routes is invalid', () => {
    class DummyController {}
    expect(() => buildRouterFromClass(DummyController, null as any)).toThrow(
      'Invalid controller metadata: meta.routes must be an array',
    );
    expect(() => buildRouterFromClass(DummyController, {} as any)).toThrow(
      'Invalid controller metadata: meta.routes must be an array',
    );
  });

  it('throws when route definition is incomplete', () => {
    class DummyController {}
    expect(() =>
      buildRouterFromClass(DummyController, {
        prefix: '/test',
        middlewares: [],
        routes: [{ method: '', path: '/foo', handlerKey: 'bar' }],
      }),
    ).toThrow('Invalid route definition');
  });

  it('throws when handlerKey does not exist on controller', () => {
    class DummyController {}
    expect(() =>
      buildRouterFromClass(DummyController, {
        prefix: '/test',
        middlewares: [],
        routes: [{ method: 'GET', path: '/foo', handlerKey: 'nonExistent' }],
      }),
    ).toThrow('Handler "nonExistent" is not a function on controller class');
  });

  it('throws when HTTP method is unsupported by router', () => {
    class DummyController {
      badMethod() {}
    }
    expect(() =>
      buildRouterFromClass(DummyController, {
        prefix: '/test',
        middlewares: [],
        routes: [{ method: 'INVALID_VERB', path: '/foo', handlerKey: 'badMethod' }],
      }),
    ).toThrow('Unsupported HTTP method: INVALID_VERB');
  });

  it('mounts basic route and executes bound handler', async () => {
    class HelloController {
      public greeting = 'hello';
      getHello(req: Request, res: Response) {
        res.json({ msg: `${this.greeting} world` });
      }
    }

    const router = buildRouterFromClass(HelloController, {
      prefix: '/api',
      middlewares: [],
      routes: [{ method: 'GET', path: '/hello', handlerKey: 'getHello' }],
    });

    const app = express();
    app.use(router);

    const res = await supertest(app).get('/hello');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ msg: 'hello world' });
  });

  it('resolves decorated parameters (body, param, query, headers, req, res)', async () => {
    class ParamController {
      handleAll(
        body: any,
        idParam: string,
        allParams: any,
        qSearch: string,
        allQuery: any,
        hAuth: string,
        allHeaders: any,
        req: Request,
        res: Response,
      ) {
        res.json({
          body,
          idParam,
          allParams,
          qSearch,
          allQuery,
          hAuth,
          hasHeaderKey: 'x-custom' in allHeaders,
          reqMethod: req.method,
        });
      }
    }

    const router = buildRouterFromClass(ParamController, {
      prefix: '/params',
      middlewares: [],
      routes: [
        {
          method: 'POST',
          path: '/item/:id',
          handlerKey: 'handleAll',
          params: [
            { index: 0, source: 'body' },
            { index: 1, source: 'param', key: 'id' },
            { index: 2, source: 'param' },
            { index: 3, source: 'query', key: 'search' },
            { index: 4, source: 'query' },
            { index: 5, source: 'headers', key: 'authorization' },
            { index: 6, source: 'headers' },
            { index: 7, source: 'req' },
            { index: 8, source: 'res' },
          ],
        },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use(router);

    const res = await supertest(app)
      .post('/item/123?search=test')
      .set('authorization', 'Bearer token123')
      .set('x-custom', 'val')
      .send({ name: 'gadget' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      body: { name: 'gadget' },
      idParam: '123',
      allParams: { id: '123' },
      qSearch: 'test',
      allQuery: { search: 'test' },
      hAuth: 'Bearer token123',
      hasHeaderKey: true,
      reqMethod: 'POST',
    });
  });

  it('executes route-level middlewares from registered middleware resolvers', async () => {
    const executedSteps: string[] = [];

    addMiddlewareResolver({
      name: 'audit-pre',
      filePath: '/virtual/audit-pre.ts',
      phase: 'pre',
      priority: 10,
      getHandlers: (entry) => {
        if (entry.metadata?.audit) {
          return [
            (req: Request, res: Response, next: NextFunction) => {
              executedSteps.push(`audit:${entry.metadata?.audit}`);
              next();
            },
          ];
        }
        return [];
      },
    });

    class RouteMiddlewareController {
      guarded(req: Request, res: Response) {
        executedSteps.push('handler');
        res.json({ ok: true });
      }

      paramGuarded(body: any, res: Response) {
        executedSteps.push('paramHandler');
        res.json({ ok: true, body });
      }
    }

    const router = buildRouterFromClass(RouteMiddlewareController, {
      prefix: '/protected',
      middlewares: [],
      routes: [
        {
          method: 'GET',
          path: '/guarded',
          handlerKey: 'guarded',
          metadata: { audit: 'read-guarded' },
        },
        {
          method: 'POST',
          path: '/param-guarded',
          handlerKey: 'paramGuarded',
          metadata: { audit: 'write-guarded' },
          params: [
            { index: 0, source: 'body' },
            { index: 1, source: 'res' },
          ],
        },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use(router);

    await supertest(app).get('/guarded').expect(200);
    expect(executedSteps).toEqual(['audit:read-guarded', 'handler']);

    executedSteps.length = 0;
    await supertest(app).post('/param-guarded').send({ x: 1 }).expect(200);
    expect(executedSteps).toEqual(['audit:write-guarded', 'paramHandler']);
  });
});
