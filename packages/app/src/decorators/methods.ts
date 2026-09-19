import { KERITH_ROUTES } from './symbols.js';
import type { HttpMethod, RouteDefinition, RouteOptions } from '../types/routing.js';

function createMethodDecorator(method: HttpMethod, path: string, options?: RouteOptions) {
  return function (target: any, propertyKey: string) {
    if (!target[KERITH_ROUTES]) {
      target[KERITH_ROUTES] = [];
    }

    const routes = target[KERITH_ROUTES] as RouteDefinition[];
    routes.push({
      method,
      path,
      handlerKey: propertyKey,
      ...(options?.metadata !== undefined && { metadata: options.metadata }),
    });
  };
}

export function Get(path: string, options?: RouteOptions) {
  return createMethodDecorator('get', path, options);
}

export function Post(path: string, options?: RouteOptions) {
  return createMethodDecorator('post', path, options);
}

export function Put(path: string, options?: RouteOptions) {
  return createMethodDecorator('put', path, options);
}

export function Patch(path: string, options?: RouteOptions) {
  return createMethodDecorator('patch', path, options);
}

export function Delete(path: string, options?: RouteOptions) {
  return createMethodDecorator('delete', path, options);
}
