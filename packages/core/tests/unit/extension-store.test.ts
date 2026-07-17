import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAliasProvider,
  registerMiddlewareResolver,
  registerScheduleProvider,
  registerBindingProvider,
  registerIdentifierMetadata,
} from '../../src/extension/index.js';
import {
  _resetExtensionStore,
  getRegisteredAliasProviders,
  getRegisteredMiddlewareResolvers,
  getRegisteredScheduleProviders,
  getRegisteredBindingProviders,
  getRegisteredIdentifierMetadata,
} from '../../src/extension/store.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeAliasProvider = (name = 'db') => ({
  prefix: 'client',
  name,
  filePath: `/fake/path/${name}.ts`,
  resolve: () => ({ query: () => {} }),
});

const makeMiddlewareResolver = (phase: 'pre' | 'post' = 'pre', priority = 10) => ({
  phase,
  priority,
  resolve: (_ctrl: any) => [],
});

const makeScheduleProvider = (name = 'cleanup', timing: 'after-bootstrap' | 'on-listen' | 'on-shutdown' = 'after-bootstrap') => ({
  name,
  timing,
  execute: async () => {},
});

const makeBindingProvider = (name = 'email-worker') => ({
  name,
  kind: 'worker',
  bind: async () => {},
});

const makeIdentifierMetadata = (name = 'Client') => ({
  name,
  category: 'infrastructure' as const,
  kind: 'logical' as const,
  channel: 'alias' as const,
  trackable: true,
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('extension/index.ts — registro de providers', () => {
  beforeEach(() => {
    _resetExtensionStore();
  });

  // ─── registerAliasProvider ───────────────────────────────────────────────

  describe('registerAliasProvider', () => {
    it('registra un AliasProvider correctamente', () => {
      registerAliasProvider(makeAliasProvider('db'));
      const providers = getRegisteredAliasProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('db');
      expect(providers[0].prefix).toBe('client');
    });

    it('acepta multiples providers con nombres distintos', () => {
      registerAliasProvider(makeAliasProvider('db'));
      registerAliasProvider(makeAliasProvider('redis'));
      expect(getRegisteredAliasProviders()).toHaveLength(2);
    });

    it('lanza DUPLICATE_EXTENSION_PROVIDER si el nombre ya existe', () => {
      registerAliasProvider(makeAliasProvider('db'));
      expect(() => registerAliasProvider(makeAliasProvider('db'))).toThrowError(
        /DUPLICATE_EXTENSION_PROVIDER|duplicate AliasProvider/
      );
    });
  });

  // ─── registerMiddlewareResolver ──────────────────────────────────────────

  describe('registerMiddlewareResolver', () => {
    it('registra un MiddlewareResolver pre correctamente', () => {
      registerMiddlewareResolver(makeMiddlewareResolver('pre', 10));
      const resolvers = getRegisteredMiddlewareResolvers();
      expect(resolvers).toHaveLength(1);
      expect(resolvers[0].phase).toBe('pre');
      expect(resolvers[0].priority).toBe(10);
    });

    it('registra un MiddlewareResolver post correctamente', () => {
      registerMiddlewareResolver(makeMiddlewareResolver('post', 5));
      const resolvers = getRegisteredMiddlewareResolvers();
      expect(resolvers[0].phase).toBe('post');
    });

    it('acepta multiples resolvers sin requerir nombre unico (no hay colision)', () => {
      registerMiddlewareResolver(makeMiddlewareResolver('pre', 10));
      registerMiddlewareResolver(makeMiddlewareResolver('pre', 20));
      registerMiddlewareResolver(makeMiddlewareResolver('post', 1));
      expect(getRegisteredMiddlewareResolvers()).toHaveLength(3);
    });

    it('no lanza en registro duplicado (MiddlewareResolver no tiene name)', () => {
      expect(() => {
        registerMiddlewareResolver(makeMiddlewareResolver('pre', 10));
        registerMiddlewareResolver(makeMiddlewareResolver('pre', 10));
      }).not.toThrow();
    });
  });

  // ─── registerScheduleProvider ────────────────────────────────────────────

  describe('registerScheduleProvider', () => {
    it('registra un ScheduleProvider after-bootstrap correctamente', () => {
      registerScheduleProvider(makeScheduleProvider('cleanup', 'after-bootstrap'));
      const providers = getRegisteredScheduleProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('cleanup');
      expect(providers[0].timing).toBe('after-bootstrap');
    });

    it('acepta los tres timings validos', () => {
      registerScheduleProvider(makeScheduleProvider('a', 'after-bootstrap'));
      registerScheduleProvider(makeScheduleProvider('b', 'on-listen'));
      registerScheduleProvider(makeScheduleProvider('c', 'on-shutdown'));
      expect(getRegisteredScheduleProviders()).toHaveLength(3);
    });

    it('lanza DUPLICATE_EXTENSION_PROVIDER si el nombre ya existe', () => {
      registerScheduleProvider(makeScheduleProvider('cleanup'));
      expect(() => registerScheduleProvider(makeScheduleProvider('cleanup'))).toThrowError(
        /DUPLICATE_EXTENSION_PROVIDER|duplicate ScheduleProvider/
      );
    });
  });

  // ─── registerBindingProvider ─────────────────────────────────────────────

  describe('registerBindingProvider', () => {
    it('registra un BindingProvider correctamente', () => {
      registerBindingProvider(makeBindingProvider('email-worker'));
      const providers = getRegisteredBindingProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('email-worker');
      expect(providers[0].kind).toBe('worker');
    });

    it('acepta multiples providers con nombres distintos', () => {
      registerBindingProvider(makeBindingProvider('email-worker'));
      registerBindingProvider(makeBindingProvider('pdf-processor'));
      expect(getRegisteredBindingProviders()).toHaveLength(2);
    });

    it('lanza DUPLICATE_EXTENSION_PROVIDER si el nombre ya existe', () => {
      registerBindingProvider(makeBindingProvider('email-worker'));
      expect(() => registerBindingProvider(makeBindingProvider('email-worker'))).toThrowError(
        /DUPLICATE_EXTENSION_PROVIDER|duplicate BindingProvider/
      );
    });

    it('acepta distintos kind para un mismo provider', () => {
      registerBindingProvider({ name: 'worker-a', kind: 'bullmq', bind: async () => {} });
      registerBindingProvider({ name: 'saga-a', kind: 'saga', bind: async () => {} });
      const providers = getRegisteredBindingProviders();
      expect(providers.find(p => p.kind === 'bullmq')).toBeDefined();
      expect(providers.find(p => p.kind === 'saga')).toBeDefined();
    });
  });

  // ─── registerIdentifierMetadata ──────────────────────────────────────────

  describe('registerIdentifierMetadata', () => {
    it('registra IdentifierMetadata correctamente', () => {
      registerIdentifierMetadata(makeIdentifierMetadata('Client'));
      const all = getRegisteredIdentifierMetadata();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Client');
      expect(all[0].category).toBe('infrastructure');
      expect(all[0].kind).toBe('logical');
      expect(all[0].channel).toBe('alias');
      expect(all[0].trackable).toBe(true);
    });

    it('acepta multiples entradas con nombres distintos', () => {
      registerIdentifierMetadata(makeIdentifierMetadata('Client'));
      registerIdentifierMetadata(makeIdentifierMetadata('Provider'));
      expect(getRegisteredIdentifierMetadata()).toHaveLength(2);
    });

    it('lanza DUPLICATE_EXTENSION_PROVIDER si el nombre ya existe', () => {
      registerIdentifierMetadata(makeIdentifierMetadata('Client'));
      expect(() => registerIdentifierMetadata(makeIdentifierMetadata('Client'))).toThrowError(
        /DUPLICATE_EXTENSION_PROVIDER|duplicate IdentifierMetadata/
      );
    });

    it('acepta metadata sin channel (campo opcional)', () => {
      expect(() => {
        registerIdentifierMetadata({
          name: 'Entity',
          category: 'data',
          kind: 'structural',
          trackable: false,
        });
      }).not.toThrow();
      const all = getRegisteredIdentifierMetadata();
      expect(all[0].channel).toBeUndefined();
    });
  });

  // ─── _resetExtensionStore ─────────────────────────────────────────────────

  describe('_resetExtensionStore', () => {
    it('limpia todos los stores a la vez', () => {
      registerAliasProvider(makeAliasProvider('db'));
      registerMiddlewareResolver(makeMiddlewareResolver());
      registerScheduleProvider(makeScheduleProvider());
      registerBindingProvider(makeBindingProvider());
      registerIdentifierMetadata(makeIdentifierMetadata('Client'));

      _resetExtensionStore();

      expect(getRegisteredAliasProviders()).toHaveLength(0);
      expect(getRegisteredMiddlewareResolvers()).toHaveLength(0);
      expect(getRegisteredScheduleProviders()).toHaveLength(0);
      expect(getRegisteredBindingProviders()).toHaveLength(0);
      expect(getRegisteredIdentifierMetadata()).toHaveLength(0);
    });

    it('permite re-registrar el mismo nombre despues del reset sin error', () => {
      registerAliasProvider(makeAliasProvider('db'));
      _resetExtensionStore();
      expect(() => registerAliasProvider(makeAliasProvider('db'))).not.toThrow();
    });
  });
});
