import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHttpLogger } from '../http-logger.js';
import * as pinoInstance from '../pino-instance.js';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../pino-instance.js', () => ({
  getPinoInstance: vi.fn(),
}));

describe('useHttpLogger', () => {
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      child: vi.fn().mockReturnThis(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      isLevelEnabled: vi.fn().mockReturnValue(false),
    };

    vi.mocked(pinoInstance.getPinoInstance).mockReturnValue(mockLogger as any);
  });

  const createMockReq = (overrides = {}) => ({
    method: 'GET',
    path: '/users',
    originalUrl: '/users',
    ...overrides,
  } as Request);

  const createMockRes = (overrides = {}) => {
    const res: any = {
      statusCode: 200,
      headersSent: false,
      locals: {},
      on: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      ...overrides,
    };
    return res as Response;
  };

  const createMockNext = () => vi.fn() as NextFunction;

  // Helper to simulate the response 'finish' event
  const triggerFinish = (res: any) => {
    const onCall = res.on.mock.calls.find((call: any[]) => call[0] === 'finish');
    if (onCall) onCall[1]();
  };

  it('useHttpLogger() without options does not throw', () => {
    expect(() => useHttpLogger()).not.toThrow();
  });

  describe('requests()', () => {
    it('logs method, path, status and responseTime', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      
      triggerFinish(res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          responseTime: expect.any(Number),
        }),
        'GET /users 200'
      );
    });

    it('uses warn level for 4xx', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes({ statusCode: 404 });
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
        'GET /users 404'
      );
    });

    it('uses error level for 5xx', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes({ statusCode: 500 });
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
        'GET /users 500'
      );
    });

    it('ignores exact routes in ignore list', () => {
      const logger = useHttpLogger({ ignore: ['/health'] });
      const req = createMockReq({ path: '/health' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled(); // Hook shouldn't be added
    });

    it('ignores simple glob routes in ignore list', () => {
      const logger = useHttpLogger({ ignore: ['/health*'] });
      const req = createMockReq({ path: '/health/check' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('ignores wildcard in middle segment', () => {
      const logger = useHttpLogger({ ignore: ['/api/*/status'] });
      const req = createMockReq({ path: '/api/v1/status' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('ignores wildcard in middle segment with different version', () => {
      const logger = useHttpLogger({ ignore: ['/api/*/status'] });
      const req = createMockReq({ path: '/api/v2/status' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('does not ignore when wildcard pattern does not match', () => {
      const logger = useHttpLogger({ ignore: ['/api/*/status'] });
      const req = createMockReq({ path: '/api/v1/users' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalled(); // Hook should be added
    });

    it('el wildcard no cruza barras (no es greedy)', () => {
      const logger = useHttpLogger({ ignore: ['/api/*/status'] });
      const req = createMockReq({ path: '/api/v1/extra/status' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalled(); // Hook should be added (no debe ignorar)
    });

    it('logs originalUrl instead of path when mounted with prefix', () => {
      const logger = useHttpLogger();
      const req = createMockReq({
        path: '/users',
        originalUrl: '/api/v1/users?page=1',
      });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          responseTime: expect.any(Number),
        }),
        'GET /api/v1/users?page=1 200'
      );
    });

    it('usa originalUrl en el mensaje del log, no path', () => {
      const logger = useHttpLogger();
      const req = createMockReq({
        path: '/users',
        originalUrl: '/api/v1/users?page=2',
      });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          responseTime: expect.any(Number),
        }),
        'GET /api/v1/users?page=2 200'
      );
    });

    it('generates requestId when enabled', () => {
      const logger = useHttpLogger({ requestId: true });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);

      expect(res.locals.requestId).toBeDefined();
      expect(typeof res.locals.requestId).toBe('string');
    });

    it('includes requestId in log meta when enabled', () => {
      const logger = useHttpLogger({ requestId: true });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          responseTime: expect.any(Number),
          requestId: expect.any(String),
        }),
        'GET /users 200'
      );
    });

    it('uses custom getRequestId function when provided', () => {
      const customId = 'custom-request-id-123';
      const logger = useHttpLogger({
        requestId: true,
        getRequestId: () => customId,
      });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);

      expect(res.locals.requestId).toBe(customId);
    });

    it('uses getRequestId with req parameter for header extraction', () => {
      const logger = useHttpLogger({
        requestId: true,
        getRequestId: (req: any) => req.headers['x-request-id'] as string ?? 'fallback-id',
      });
      const req = createMockReq({ headers: { 'x-request-id': 'header-id-456' } });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);

      expect(res.locals.requestId).toBe('header-id-456');
    });

    it('does not generate requestId when disabled', () => {
      const logger = useHttpLogger({ requestId: false });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);

      expect(res.locals.requestId).toBeUndefined();
    });

    it('does not include requestId in log when disabled', () => {
      const logger = useHttpLogger({ requestId: false });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      const logCall = mockLogger.info.mock.calls[0];
      expect(logCall[0]).not.toHaveProperty('requestId');
    });

    it('con requestId: true, la ruta ignorada SÍ recibe requestId', () => {
      const logger = useHttpLogger({ requestId: true, ignore: ['/health'] });
      const req = createMockReq({ path: '/health' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);

      // El requestId se genera antes del ignore check, así que debe estar presente
      expect(res.locals.requestId).toBeDefined();
      expect(typeof res.locals.requestId).toBe('string');
      // Pero el log no se debe generar
      expect(res.on).not.toHaveBeenCalled();
    });
  });

  describe('errors()', () => {
    it('logs error with stack', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('Database connection failed');

      logger.errors()(err, req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: err,
          status: 500,
        }),
        'GET /users — Database connection failed'
      );
    });

    it('responds with correct status from error or 500 by default', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      
      const customErr: any = new Error('Not found');
      customErr.status = 404;

      logger.errors()(customErr, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    it('serializes error using pino err field', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('Test error');

      logger.errors()(err, req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: err,
        }),
        expect.any(String)
      );
    });

    it('logs originalUrl instead of path when mounted with prefix', () => {
      const logger = useHttpLogger();
      const req = createMockReq({
        path: '/users',
        originalUrl: '/api/v1/users?page=1',
      });
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('Database connection failed');

      logger.errors()(err, req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: err,
          status: 500,
        }),
        'GET /api/v1/users?page=1 — Database connection failed'
      );
    });

    it('sanitizes error message in production by default', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');

      logger.errors()(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      // Log interno siempre tiene el mensaje real
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: err,
          status: 500,
        }),
        'GET /users — connect ECONNREFUSED 127.0.0.1:5432'
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('does not sanitize in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');

      logger.errors()(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith({ error: 'connect ECONNREFUSED 127.0.0.1:5432' });

      process.env.NODE_ENV = originalEnv;
    });

    it('respects sanitizeErrors=false even in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const logger = useHttpLogger({ sanitizeErrors: false });
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');

      logger.errors()(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith({ error: 'connect ECONNREFUSED 127.0.0.1:5432' });

      process.env.NODE_ENV = originalEnv;
    });
  });
});
