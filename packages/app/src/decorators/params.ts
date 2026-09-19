import { ParamSource, ParamDefinition } from '../types/routing.js';
import { KERITH_PARAMS } from './symbols.js';

function createParamDecorator(source: ParamSource, key?: string) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    if (propertyKey === undefined) {
      throw new TypeError('Param decorators are not supported on constructors — Kerith has no DI container');
    }
    
    target[KERITH_PARAMS] = target[KERITH_PARAMS] || {};
    target[KERITH_PARAMS][propertyKey] = target[KERITH_PARAMS][propertyKey] || [];
    
    target[KERITH_PARAMS][propertyKey].push({
      index: parameterIndex,
      source,
      key
    });
  };
}

export function Body() {
  return createParamDecorator('body');
}

export function Param(key?: string) {
  return createParamDecorator('param', key);
}

export function Query(key?: string) {
  return createParamDecorator('query', key);
}

export function Headers(key?: string) {
  return createParamDecorator('headers', key);
}

export function Req() {
  return createParamDecorator('req');
}

export function Res() {
  return createParamDecorator('res');
}
