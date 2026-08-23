import { Router } from 'express';

interface RouteDefinition {
  method: string;
  path: string;
  handlerKey: string;
}

interface AppControllerMeta {
  prefix: string;
  routes: RouteDefinition[];
  middlewares: any[];
  metadata?: Record<string, unknown>;
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

    const boundHandler = handler.bind(instance);
    const method = route.method.toLowerCase();

    if (typeof (router as any)[method] === 'function') {
      (router as any)[method](route.path, boundHandler);
    } else {
      throw new Error(
        `Unsupported HTTP method: ${route.method}`,
      );
    }
  }

  return router;
}
