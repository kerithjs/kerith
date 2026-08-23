import { KERITH_ROUTES } from './symbols.js';
import type { HttpMethod, RouteDefinition } from '../types/routing.js';

function createMethodDecorator(method: HttpMethod, path: string) {
  return function (target: any, propertyKey: string) {
    if (!target[KERITH_ROUTES]) {
      target[KERITH_ROUTES] = [];
    }

    const routes = target[KERITH_ROUTES] as RouteDefinition[];
    routes.push({ method, path, handlerKey: propertyKey });
  };
}

export function Get(path: string) {
  return createMethodDecorator('get', path);
}

export function Post(path: string) {
  return createMethodDecorator('post', path);
}

export function Put(path: string) {
  return createMethodDecorator('put', path);
}

export function Patch(path: string) {
  return createMethodDecorator('patch', path);
}

export function Delete(path: string) {
  return createMethodDecorator('delete', path);
}
