import { describe, it, expect } from 'vitest';
import { Controller } from '../src/decorators/controller.js';
import { Get, Post, Put, Patch, Delete } from '../src/decorators/methods.js';
import { KERITH_CONTROLLER, KERITH_ROUTES } from '../src/decorators/symbols.js';

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
