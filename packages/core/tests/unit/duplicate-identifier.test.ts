import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAliasProvider,
  registerMiddlewareResolver,
  registerScheduleProvider,
  registerBindingProvider,
} from '../../src/extension/index.js';
import { _resetExtensionStore } from '../../src/extension/store.js';
import { KerithError } from '../../src/core/errors.js';

describe('Duplicate Identifier Validation', () => {
  beforeEach(() => {
    _resetExtensionStore();
  });

  describe('Middleware (MiddlewareResolver)', () => {
    it('should throw DUPLICATE_MIDDLEWARE_IDENTIFIER when two MiddlewareResolvers have the same name in the same file', () => {
      const filePath = '/src/modules/users/guards.ts';

      registerMiddlewareResolver({
        name: 'auth',
        filePath,
        phase: 'pre',
        priority: 1,
        getHandlers: () => [],
      });

      expect(() => {
        registerMiddlewareResolver({
          name: 'auth',
          filePath, // Same file
          phase: 'pre',
          priority: 1,
          getHandlers: () => [],
        });
      }).toThrow(KerithError);

      try {
        registerMiddlewareResolver({
          name: 'auth',
          filePath,
          phase: 'pre',
          priority: 1,
          getHandlers: () => [],
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_MIDDLEWARE_IDENTIFIER');
        expect((error as KerithError).message).toContain('duplicate MiddlewareResolver "auth" inside the same file');
      }
    });

    it('should throw DUPLICATE_EXTENSION_PROVIDER when two MiddlewareResolvers have the same name in different files', () => {
      const filePath1 = '/src/modules/users/guards-1.ts';
      const filePath2 = '/src/modules/users/guards-2.ts';

      registerMiddlewareResolver({
        name: 'auth',
        filePath: filePath1,
        phase: 'pre',
        priority: 1,
        getHandlers: () => [],
      });

      expect(() => {
        registerMiddlewareResolver({
          name: 'auth',
          filePath: filePath2, // Different file
          phase: 'pre',
          priority: 1,
          getHandlers: () => [],
        });
      }).toThrow(KerithError);

      try {
        registerMiddlewareResolver({
          name: 'auth',
          filePath: filePath2,
          phase: 'pre',
          priority: 1,
          getHandlers: () => [],
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_EXTENSION_PROVIDER');
        expect((error as KerithError).message).toContain('duplicate MiddlewareResolver "auth" across different files');
      }
    });
  });

  describe('Schedule (ScheduleProvider)', () => {
    it('should throw DUPLICATE_SCHEDULE_IDENTIFIER when two ScheduleProviders have the same name in the same file', () => {
      const filePath = '/src/modules/users/jobs.ts';

      registerScheduleProvider({
        name: 'cron:cleanup',
        filePath,
        timing: 'after-bootstrap',
        execute: async () => {},
      });

      expect(() => {
        registerScheduleProvider({
          name: 'cron:cleanup',
          filePath, // Same file
          timing: 'after-bootstrap',
          execute: async () => {},
        });
      }).toThrow(KerithError);

      try {
        registerScheduleProvider({
          name: 'cron:cleanup',
          filePath,
          timing: 'after-bootstrap',
          execute: async () => {},
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_SCHEDULE_IDENTIFIER');
        expect((error as KerithError).message).toContain('duplicate ScheduleProvider "cron:cleanup" inside the same file');
      }
    });

    it('should throw DUPLICATE_EXTENSION_PROVIDER when two ScheduleProviders have the same name in different files', () => {
      const filePath1 = '/src/modules/users/jobs-1.ts';
      const filePath2 = '/src/modules/users/jobs-2.ts';

      registerScheduleProvider({
        name: 'cron:cleanup',
        filePath: filePath1,
        timing: 'after-bootstrap',
        execute: async () => {},
      });

      expect(() => {
        registerScheduleProvider({
          name: 'cron:cleanup',
          filePath: filePath2, // Different file
          timing: 'after-bootstrap',
          execute: async () => {},
        });
      }).toThrow(KerithError);

      try {
        registerScheduleProvider({
          name: 'cron:cleanup',
          filePath: filePath2,
          timing: 'after-bootstrap',
          execute: async () => {},
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_EXTENSION_PROVIDER');
        expect((error as KerithError).message).toContain('duplicate ScheduleProvider "cron:cleanup" across different files');
      }
    });
  });

  describe('Binding (BindingProvider)', () => {
    it('should throw DUPLICATE_BINDING_IDENTIFIER when two BindingProviders have the same name in the same file', () => {
      const filePath = '/src/modules/users/workers.ts';

      registerBindingProvider({
        name: 'email',
        filePath,
        kind: 'worker',
        bind: async () => {},
      });

      expect(() => {
        registerBindingProvider({
          name: 'email',
          filePath, // Same file
          kind: 'worker',
          bind: async () => {},
        });
      }).toThrow(KerithError);

      try {
        registerBindingProvider({
          name: 'email',
          filePath,
          kind: 'worker',
          bind: async () => {},
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_BINDING_IDENTIFIER');
        expect((error as KerithError).message).toContain('duplicate BindingProvider "email" inside the same file');
      }
    });

    it('should throw DUPLICATE_EXTENSION_PROVIDER when two BindingProviders have the same name in different files', () => {
      const filePath1 = '/src/modules/users/workers-1.ts';
      const filePath2 = '/src/modules/users/workers-2.ts';

      registerBindingProvider({
        name: 'email',
        filePath: filePath1,
        kind: 'worker',
        bind: async () => {},
      });

      expect(() => {
        registerBindingProvider({
          name: 'email',
          filePath: filePath2, // Different file
          kind: 'worker',
          bind: async () => {},
        });
      }).toThrow(KerithError);

      try {
        registerBindingProvider({
          name: 'email',
          filePath: filePath2,
          kind: 'worker',
          bind: async () => {},
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_EXTENSION_PROVIDER');
        expect((error as KerithError).message).toContain('duplicate BindingProvider "email" across different files');
      }
    });
  });

  describe('Alias (AliasProvider)', () => {
    it('should throw DUPLICATE_ALIAS_IDENTIFIER when two AliasProviders have the same prefix/name in the same file', () => {
      const filePath = '/src/modules/users/clients.ts';

      registerAliasProvider({
        prefix: 'Client',
        name: 'db',
        filePath,
        resolve: () => ({}),
      });

      expect(() => {
        registerAliasProvider({
          prefix: 'Client',
          name: 'db',
          filePath, // Same file
          resolve: () => ({}),
        });
      }).toThrow(KerithError);

      try {
        registerAliasProvider({
          prefix: 'Client',
          name: 'db',
          filePath,
          resolve: () => ({}),
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_ALIAS_IDENTIFIER');
        expect((error as KerithError).message).toContain('duplicate AliasProvider "Client/db" inside the same file');
      }
    });

    it('should throw DUPLICATE_EXTENSION_PROVIDER when two AliasProviders have the same prefix/name in different files', () => {
      const filePath1 = '/src/modules/users/clients-1.ts';
      const filePath2 = '/src/modules/users/clients-2.ts';

      registerAliasProvider({
        prefix: 'Client',
        name: 'db',
        filePath: filePath1,
        resolve: () => ({}),
      });

      expect(() => {
        registerAliasProvider({
          prefix: 'Client',
          name: 'db',
          filePath: filePath2, // Different file
          resolve: () => ({}),
        });
      }).toThrow(KerithError);

      try {
        registerAliasProvider({
          prefix: 'Client',
          name: 'db',
          filePath: filePath2,
          resolve: () => ({}),
        });
      } catch (error) {
        expect((error as KerithError).code).toBe('DUPLICATE_EXTENSION_PROVIDER');
        expect((error as KerithError).message).toContain('duplicate AliasProvider "Client/db" across different files');
      }
    });
  });
});
