import type { RequestHandler, ErrorRequestHandler } from 'express';
import { getPinoInstance } from './pino-instance.js';
import type { HttpLogger, HttpLoggerOptions } from '../types/index.js';

/**
 * Opt-in HTTP logger hook that returns Express middlewares for request and error logging.
 * It shares the same Pino instance as the rest of the Kerith application.
 *
 * @example
 * ```ts
 * import { useHttpLogger } from '@kerith/core';
 * 
 * const httpLogger = useHttpLogger({ ignore: ['/health*'] });
 * 
 * // Mount `requests()` early in your Express pipeline
 * app.use(httpLogger.requests());
 * 
 * // ... your routes and Kerith app here ...
 * 
 * // Mount `errors()` at the very end to catch unhandled exceptions
 * app.use(httpLogger.errors());
 * ```
 * 
 * @param options - Configuration options such as routes to ignore.
 * @returns An object with `requests()` and `errors()` middleware generators.
 */
export function useHttpLogger(options: HttpLoggerOptions = {}): HttpLogger {
  const logger = getPinoInstance().child({ service: 'http' });
  const ignorePatterns = options.ignore ?? [];

  function patternToRegex(pattern: string): RegExp {
    // Escapar todo excepto '*', luego convertir '*' a '[^/]+'
    // '[^/]+' matchea un segmento pero NO cruza barras
    // Esto cubre: '/health*', '/api/*/status', '/a/b/c'
    // Si '*' está al final, permitimos cruzar barras (comportamiento original)
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&');  // escapar regex specials
    
    if (pattern.endsWith('*')) {
      // Comportamiento original para * al final: cruza barras
      const prefix = escaped.slice(0, -1); // quitar el * escapado
      return new RegExp(`^${prefix}.*$`);
    } else {
      // * en medio: solo un segmento sin barras
      const withWildcard = escaped.replace(/\*/g, '[^/]+');
      return new RegExp(`^${withWildcard}(/.*)?$`);
    }
  }

  const compiledPatterns = ignorePatterns.map(patternToRegex);

  const shouldIgnore = (path: string): boolean => {
    return compiledPatterns.some((re) => re.test(path));
  };

  return {
    requests(): RequestHandler {
      return (req, res, next) => {
        // Generar requestId si está habilitado
        if (options.requestId) {
          const getId = options.getRequestId ?? (() => crypto.randomUUID());
          res.locals.requestId = getId(req);
        }

        if (shouldIgnore(req.path)) {
          return next();
        }

        const start = Date.now();

        res.on('finish', () => {
          const responseTime = Date.now() - start;
          const status = res.statusCode;
          const msg = `${req.method} ${req.originalUrl} ${status}`;

          let level: 'info' | 'warn' | 'error' = 'info';
          if (status >= 400 && status < 500) {
            level = 'warn';
          } else if (status >= 500) {
            level = 'error';
          }

          const meta: Record<string, unknown> = {
            status,
            responseTime,
          };

          if (res.locals.requestId) {
            meta.requestId = res.locals.requestId;
          }

          // Pino exposes isLevelEnabled, but we can also just log it in debug if options.logBody is true
          if (options.logBody && logger.isLevelEnabled('debug')) {
            meta.body = req.body;
          }

          logger[level](meta, msg);
        });

        next();
      };
    },

    errors(): ErrorRequestHandler {
      // Express requires 4 arguments for error handlers, even if next is unused
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return (err: any, req, res, next) => {
        const msg = `${req.method} ${req.originalUrl}`;
        const status = err?.status ?? 500;

        // Normalize non-Error thrown values (strings, numbers, plain objects, etc.)
        // so that .message is always defined in both the log and the HTTP response.
        const normalizedErr = err instanceof Error
          ? err
          : new Error(typeof err === 'string' ? err : JSON.stringify(err));

        // Log interno: siempre el mensaje real (para debugging).
        // `raw` preserves the original thrown value for structured inspection.
        const logMeta: Record<string, unknown> = { err: normalizedErr, status };
        if (!(err instanceof Error)) logMeta.raw = err;
        logger.error(logMeta, `${msg} — ${normalizedErr.message}`);

        if (!res.headersSent) {
          const sanitize = options.sanitizeErrors !== false;
          const isProduction = process.env.NODE_ENV === 'production';
          const clientMessage = (sanitize && isProduction)
            ? 'Internal server error'
            : normalizedErr.message;

          res.status(status).json({ error: clientMessage });
        }
      };
    },
  };
}
