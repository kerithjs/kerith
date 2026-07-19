// src/http/filter.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerMiddlewarePlugin } from '../channels/index.js';

/**
 * Registers a typed error filter as a middleware plugin (phase: 'error', priority: 1).
 *
 * The handler returned has exactly 4 parameters — required by Express for error middleware
 * (Core validates arity). If the error is not an instance of `errorType`, the filter passes
 * it to `next(err)` so the next filter in the chain can attempt to handle it.
 *
 * `Filter()` is global — it does not depend on `ControllerEntry` fields and is not
 * affected by §0.3. `getHandlers()` always returns its handler regardless of the
 * controller argument.
 *
 * @param name       Identifier for this filter (for catalog / tracing).
 * @param errorType  Error class to match against. Uses `instanceof` check.
 * @param handler    Receives the matched error and returns a `{ status, error, ...extras }` shape.
 *
 * @example
 * ```ts
 * import { Filter } from '@kerith/identifiers';
 *
 * class NotFoundError extends Error { constructor(msg: string) { super(msg); } }
 *
 * Filter('not-found', NotFoundError, (err) => ({
 *   status: 404,
 *   error: err.message,
 * }));
 * ```
 */
export function Filter<E extends Error>(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorType: new (...args: any[]) => E,
  handler: (err: E) => { status: number; error: string; [key: string]: unknown },
): void {
  // Called for future traceability — filePath not yet part of MiddlewarePlugin.
  getFileCallerInfo('Filter()');

  // `name` is captured for catalog / tracing — not used in runtime logic today.
  void name;

  const plugin = {
    phase: 'error' as const,
    priority: 1,
    getHandlers(_controller: unknown): unknown[] {
      return [
        // Exactly 4 parameters — Express error middleware arity requirement.
        (err: unknown, _req: unknown, res: unknown, next: (e?: unknown) => void) => {
          if (err instanceof errorType) {
            const result = handler(err as E);
            const r = res as { status: (code: number) => { json: (body: unknown) => void } };
            return r.status(result.status).json(result);
          }
          // Not this filter's responsibility — pass to next error handler.
          next(err);
        },
      ];
    },
  };

  registerMiddlewarePlugin(plugin);
}
