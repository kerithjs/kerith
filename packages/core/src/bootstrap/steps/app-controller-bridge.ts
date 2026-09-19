import { Router, Request, Response, NextFunction } from 'express';
import type { ControllerEntry } from '../../types/index.js';
import { getRegisteredMiddlewareResolvers } from '../../extension/store.js';

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
  metadata?: Record<string, unknown>;
}

interface AppControllerMeta {
  prefix: string;
  routes: RouteDefinition[];
  middlewares: any[];
  metadata?: Record<string, unknown>;
}

/**
 * Resolves `phase: 'pre'` middleware handlers scoped to a single route.
 *
 * Implements Fase 4.0 decision (B): no change to MiddlewareResolver.getHandlers
 * signature — instead, a synthetic ControllerEntry is built per route whose
 * `.metadata` is the route-level metadata (complete override, no merge with
 * controller-level metadata). This means guard/validate/rateLimit declared on
 * a specific route apply only to that route, not to the whole controller.
 *
 * Returns [] if `route.metadata` is absent — controllers with no per-route
 * metadata are unaffected and continue to use the controller-level resolvers
 * from step-08-controllers.ts as before.
 *
 * ## Coexistence with controller-level middleware (Fase 4.5)
 *
 * When both controller-level AND route-level metadata are declared, they
 * execute in two distinct Express layers — not in conflict:
 *
 *   app.use(fullPrefix, ...controllerPreMiddlewares, router)
 *                        └── resolved by step-08 from ctrl.metadata
 *                            runs for ALL routes in this controller
 *
 *   router[method](path, ...routePreMiddlewares, handler)
 *                        └── resolved here from route.metadata
 *                            runs only for THIS specific route
 *
 * Express executes them in mount order naturally (app-level first, then
 * route-level). No special coordination is needed.
 *
 * ## "Opt-out" is intentionally impossible (Fase 4.5)
 *
 * A route cannot cancel or override a guard declared at the controller level.
 * Controller-level guards (step-08) always run for every route in that
 * controller regardless of what `route.metadata` says. Route-level metadata
 * is strictly additive — it can only add more middleware for that specific
 * route, not remove middleware inherited from the controller.
 *
 * This is by design: if a guard needs to be conditional per route, it should
 * be registered as a route-level guard, not a controller-level guard.
 *
 * ## Post/error per-route (deferred)
 *
 * Post/error per-route handlers are not implemented here: no phase:'post'|
 * 'error' identifiers exist today, so there is no concrete case to support.
 */
function resolveRouteMiddlewares(
  ControllerClass: any,
  ctrlMeta: AppControllerMeta,
  route: RouteDefinition,
): unknown[] {
  if (!route.metadata) return [];

  // Build a synthetic ControllerEntry satisfying the ControllerEntry type.
  // Guard/RateLimit/Validate only read `.metadata`, so name/path/router/etc.
  // are placeholders — they are never accessed by the resolvers in practice.
  const syntheticEntry: ControllerEntry = {
    name: ControllerClass.name ?? 'unknown',
    path: '',
    prefix: ctrlMeta.prefix,
    middlewares: [],
    router: null as any,
    enabled: true,
    metadata: route.metadata,  // complete override — no merge with ctrlMeta.metadata
  };

  return getRegisteredMiddlewareResolvers()
    .filter(r => r.phase === 'pre')
    .sort((a, b) => b.priority - a.priority)
    .flatMap(r => r.getHandlers(syntheticEntry));
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
      // Route-level pre-middlewares (Fase 4.4) run before the param-aware handler.
      const routeMiddlewares = resolveRouteMiddlewares(ControllerClass, meta, route);
      (router as any)[method](
        route.path,
        ...(routeMiddlewares as any[]),
        function paramAwareHandler(req: Request, res: Response, next: NextFunction) {
          return handler.apply(instance, resolveArgs(req, res, route.params!));
        },
      );
    } else {
      // Fase 1 path: no param decorators — pass handler bound directly.
      // Route-level pre-middlewares (Fase 4.4) run before the bound handler.
      const routeMiddlewares = resolveRouteMiddlewares(ControllerClass, meta, route);
      if (routeMiddlewares.length > 0) {
        (router as any)[method](route.path, ...(routeMiddlewares as any[]), handler.bind(instance));
      } else {
        (router as any)[method](route.path, handler.bind(instance));
      }
    }
  }

  return router;
}
