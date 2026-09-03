import { describe, it, expect } from 'vitest';
import { Controller } from '../src/decorators/controller.js';
import { Get, Post, Put, Patch, Delete } from '../src/decorators/methods.js';
import { KERITH_CONTROLLER, KERITH_ROUTES, KERITH_PARAMS } from '../src/decorators/symbols.js';
import { Body, Param, Query } from '../src/decorators/params.js';

describe('Controller Decorator', () => {
  it('should set metadata as undefined when no options provided', () => {
    @Controller('/users')
    class UsersController {}

    const meta = (UsersController as any)[KERITH_CONTROLLER];
    expect(meta).toBeDefined();
    expect(meta.prefix).toBe('/users');
    expect(meta.metadata).toBeUndefined();
  });

  it('should preserve metadata when provided', () => {
    const customMetadata = { guards: ['auth'], rateLimit: 100 };

    @Controller('/users', { metadata: customMetadata })
    class UsersController {}

    const meta = (UsersController as any)[KERITH_CONTROLLER];
    expect(meta).toBeDefined();
    expect(meta.prefix).toBe('/users');
    expect(meta.metadata).toEqual(customMetadata);
  });

  it('should throw TypeError when prefix is not a string', () => {
    expect(() => {
      @Controller(123 as any)
      class InvalidController {}
    }).toThrow(TypeError);
  });

  it('should propagate params into route entries for decorated handlers', () => {
    @Controller('/things')
    class ThingsController {
      @Get('/:id')
      getOne(@Param('id') id: string, @Query('v') v: string) {}

      @Post('/')
      create(@Body() body: any) {}
    }

    const meta = (ThingsController as any)[KERITH_CONTROLLER];

    const getOneRoute = meta.routes.find((r: any) => r.handlerKey === 'getOne');
    expect(getOneRoute.params).toHaveLength(2);
    expect(getOneRoute.params).toContainEqual({ index: 0, source: 'param', key: 'id' });
    expect(getOneRoute.params).toContainEqual({ index: 1, source: 'query', key: 'v' });

    const createRoute = meta.routes.find((r: any) => r.handlerKey === 'create');
    expect(createRoute.params).toHaveLength(1);
    expect(createRoute.params).toContainEqual({ index: 0, source: 'body', key: undefined });
  });

  it('should leave route.params undefined (not []) for handlers with no param decorators', () => {
    @Controller('/plain')
    class PlainController {
      @Get('/')
      list() {}
    }

    const meta = (PlainController as any)[KERITH_CONTROLLER];
    const route = meta.routes[0];

    // Retrocompatibilidad exacta con Fase 1: el campo params no debe existir en
    // el objeto, no debe ser [] ni undefined explícito — toBeUndefined() cubre ambos
    expect(route.params).toBeUndefined();
    expect(Object.keys(route)).not.toContain('params');
  });
});

describe('Method Decorators', () => {
  it('should accumulate routes correctly when multiple methods are used', () => {
    @Controller('/users')
    class UsersController {
      @Get('/')
      getUsers() {}

      @Post('/')
      createUser() {}

      @Put('/:id')
      updateUser() {}

      @Patch('/:id')
      patchUser() {}

      @Delete('/:id')
      deleteUser() {}
    }

    const routes = (UsersController.prototype as any)[KERITH_ROUTES];
    expect(routes).toHaveLength(5);
    expect(routes).toContainEqual({ method: 'get', path: '/', handlerKey: 'getUsers' });
    expect(routes).toContainEqual({ method: 'post', path: '/', handlerKey: 'createUser' });
    expect(routes).toContainEqual({ method: 'put', path: '/:id', handlerKey: 'updateUser' });
    expect(routes).toContainEqual({ method: 'patch', path: '/:id', handlerKey: 'patchUser' });
    expect(routes).toContainEqual({ method: 'delete', path: '/:id', handlerKey: 'deleteUser' });
  });

  it('should initialize routes array on first method decorator', () => {
    @Controller('/items')
    class ItemsController {
      @Get('/')
      getItems() {}
    }

    const routes = (ItemsController.prototype as any)[KERITH_ROUTES];
    expect(Array.isArray(routes)).toBe(true);
    expect(routes).toHaveLength(1);
  });

  it('should propagate route-level metadata and not leave undefined fields', () => {
    @Controller('/route-meta')
    class RouteMetaController {
      @Get('/1', { metadata: { validate: 'schema1' } })
      withMeta() {}

      @Get('/2')
      withoutMeta() {}
    }

    const meta = (RouteMetaController as any)[KERITH_CONTROLLER];
    
    const routeWith = meta.routes.find((r: any) => r.handlerKey === 'withMeta');
    expect(routeWith.metadata).toEqual({ validate: 'schema1' });

    const routeWithout = meta.routes.find((r: any) => r.handlerKey === 'withoutMeta');
    expect(routeWithout.metadata).toBeUndefined();
    expect(Object.keys(routeWithout)).not.toContain('metadata');
  });
});

describe('Decorator Evaluation Order', () => {
  it('should ensure method decorators run before class decorator', () => {
    // Verify that @Controller sees the populated routes array
    @Controller('/test')
    class TestController {
      @Get('/')
      testMethod() {}
    }

    const meta = (TestController as any)[KERITH_CONTROLLER];
    expect(meta.routes).toHaveLength(1);
    expect(meta.routes[0].method).toBe('get');
    expect(meta.routes[0].path).toBe('/');
    expect(meta.routes[0].handlerKey).toBe('testMethod');
  });
});
