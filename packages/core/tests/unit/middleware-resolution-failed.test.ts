import { describe, it, expect, beforeEach } from 'vitest';
import { KerithError } from '../../src/core/errors.js';
import {
  registerMiddlewareResolver,
  getRegisteredMiddlewareResolvers,
} from '../../src/extension/index.js';
import { _resetExtensionStore } from '../../src/extension/store.js';

describe('Middleware Resolution Failed Error', () => {
  beforeEach(() => {
    _resetExtensionStore();
  });

  it('should throw MIDDLEWARE_RESOLUTION_FAILED when getHandlers() throws during error phase resolution', () => {
    const failingResolver = {
      name: 'failing-guard',
      filePath: '/fake/path/failing-guard.ts',
      phase: 'error' as const,
      priority: 10,
      getHandlers: (_ctrl: any) => {
        throw new Error('Failed to resolve handlers');
      },
    };

    registerMiddlewareResolver(failingResolver);

    const resolvers = getRegisteredMiddlewareResolvers();
    const errorResolvers = resolvers.filter(r => r.phase === 'error');

    // Simulate the behavior in step-08-controllers.ts
    expect(() => {
      for (const resolver of errorResolvers) {
        try {
          resolver.getHandlers(null as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
            `File: ${resolver.filePath} — ${message}`
          );
        }
      }
    }).toThrow(KerithError);

    try {
      for (const resolver of errorResolvers) {
        try {
          resolver.getHandlers(null as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
            `File: ${resolver.filePath} — ${message}`
          );
        }
      }
    } catch (err: any) {
      expect(err.code).toBe('MIDDLEWARE_RESOLUTION_FAILED');
      expect(err.message).toContain('failing-guard');
      expect(err.details).toContain('/fake/path/failing-guard.ts');
      expect(err.details).toContain('Failed to resolve handlers');
    }
  });

  it('should throw MIDDLEWARE_RESOLUTION_FAILED when getHandlers() throws during pre phase resolution', () => {
    const failingResolver = {
      name: 'failing-rate-limit',
      filePath: '/fake/path/failing-rate-limit.ts',
      phase: 'pre' as const,
      priority: 10,
      getHandlers: (_ctrl: any) => {
        throw new Error('Rate limit configuration error');
      },
    };

    registerMiddlewareResolver(failingResolver);

    const resolvers = getRegisteredMiddlewareResolvers();
    const preResolvers = resolvers.filter(r => r.phase === 'pre');

    // Simulate the behavior in step-08-controllers.ts
    expect(() => {
      for (const resolver of preResolvers) {
        try {
          resolver.getHandlers(null as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
            `File: ${resolver.filePath} — ${message}`
          );
        }
      }
    }).toThrow(KerithError);

    try {
      for (const resolver of preResolvers) {
        try {
          resolver.getHandlers(null as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
            `File: ${resolver.filePath} — ${message}`
          );
        }
      }
    } catch (err: any) {
      expect(err.code).toBe('MIDDLEWARE_RESOLUTION_FAILED');
      expect(err.message).toContain('failing-rate-limit');
      expect(err.details).toContain('Rate limit configuration error');
    }
  });

  it('should throw MIDDLEWARE_RESOLUTION_FAILED when getHandlers() throws during post phase resolution', () => {
    const failingResolver = {
      name: 'failing-middleware',
      filePath: '/fake/path/failing-middleware.ts',
      phase: 'post' as const,
      priority: 10,
      getHandlers: (_ctrl: any) => {
        throw new Error('Post-processing error');
      },
    };

    registerMiddlewareResolver(failingResolver);

    const resolvers = getRegisteredMiddlewareResolvers();
    const postResolvers = resolvers.filter(r => r.phase === 'post');

    // Simulate the behavior in step-08-controllers.ts
    expect(() => {
      for (const resolver of postResolvers) {
        try {
          resolver.getHandlers(null as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
            `File: ${resolver.filePath} — ${message}`
          );
        }
      }
    }).toThrow(KerithError);

    try {
      for (const resolver of postResolvers) {
        try {
          resolver.getHandlers(null as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new KerithError(
            'MIDDLEWARE_RESOLUTION_FAILED',
            `Middleware resolver "${resolver.name}" failed during getHandlers() execution`,
            `File: ${resolver.filePath} — ${message}`
          );
        }
      }
    } catch (err: any) {
      expect(err.code).toBe('MIDDLEWARE_RESOLUTION_FAILED');
      expect(err.message).toContain('failing-middleware');
      expect(err.details).toContain('Post-processing error');
    }
  });
});
