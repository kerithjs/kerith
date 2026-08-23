import { Router, Request, Response, NextFunction } from 'express';

// Local duplicates of @kerith/app types — Core cannot depend on @kerith/app
// (dependency goes the other way). Keep in sync with packages/app/src/types/routing.ts.
type ParamSource = 'body' | 'param' | 'query' | 'headers' | 'req' | 'res';

interface ParamDefinition {
  index: number;
  source: ParamSource;
  key?: string;
}

interface RouteDefinition {
  method: string;
  path: string;
  handlerKey: string;
  params?: ParamDefinition[];
}

interface AppControllerMeta {
  prefix: string;
  routes: RouteDefinition[];
  middlewares: any[];
  metadata?: Record<string, unknown>;
}

/**
 * Resolves handler arguments from the request/response using the param
 * definitions registered by @Body / @Param / @Query / @Headers / @Req / @Res.
 *
 * Arguments are assigned by index so that undecorated gaps (e.g. a `next`
 * parameter between two decorated params) remain `undefined` naturally — no
 * manual pre-fill needed.
 */
function resolveArgs(req: Request, res: Response, params: ParamDefinition[]): unknown[] {
  const args: unknown[] = [];
  for (const def of params) {
    switch (def.source) {
      case 'body':
        args[def.index] = req.body;
        break;
      case 'param':
        args[def.index] = def.key ? req.params[def.key] : req.params;
        break;
      case 'query':
        args[def.index] = def.key ? req.query[def.key] : req.query;
        break;
      case 'headers':
        args[def.index] = def.key ? req.headers[def.key] : req.headers;
        break;
      case 'req':
        args[def.index] = req;
        break;
      case 'res':
        args[def.index] = res;
        break;
    }
  }
  return args;
}

export function buildRouterFromClass(
  ControllerClass: any,
  meta: AppControllerMeta,
): Router {
  if (!meta || !Array.isArray(meta.routes)) {
    throw new Error(
      'Invalid controller metadata: meta.routes must be an array',
    );
  }

  const router = Router();
  const instance = new (ControllerClass as any)();

  for (const route of meta.routes) {
    if (!route.method || !route.path || !route.handlerKey) {
      throw new Error(
        `Invalid route definition: ${JSON.stringify(route)}`,
      );
    }

    const handler = instance[route.handlerKey];
    if (typeof handler !== 'function') {
      throw new Error(
        `Handler "${route.handlerKey}" is not a function on controller class`,
      );
    }

    const method = route.method.toLowerCase();

    if (typeof (router as any)[method] !== 'function') {
      throw new Error(
        `Unsupported HTTP method: ${route.method}`,
      );
    }

    if (route.params?.length) {
      // Fase 2 path: resolve decorated parameters and invoke handler.
      // `return` is required so Express 5 can forward rejected promises to
      // next(err) automatically — without it, async handlers that throw
      // would silently swallow the error when params are in use.
      (router as any)[method](
        route.path,
        function paramAwareHandler(req: Request, res: Response, next: NextFunction) {
          return handler.apply(instance, resolveArgs(req, res, route.params!));
        },
      );
    } else {
      // Fase 1 path: no param decorators — pass handler bound directly to
      // Express so it keeps the same behaviour as before (including Express 5
      // promise forwarding, which works for free on bound functions).
      (router as any)[method](route.path, handler.bind(instance));
    }
  }

  return router;
}
