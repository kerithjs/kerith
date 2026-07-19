// src/http/middleware.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerMiddlewarePlugin } from '../channels/index.js';

/**
 * Registers a named middleware as a middleware plugin (phase: 'pre', priority: 0).
 *
 * Priority 0 means it runs after `RateLimit` (priority 2) and `Guard` (priority 1) —
 * closest to the actual route handler.
 *
 * The middleware is applied only to controllers that declare it by name in
 * `ControllerOptions.middlewareNames` — e.g. `Controller('/users', { middlewareNames: ['logger'] })`.
 * This uses the `middlewareNames` field (§0.3) to avoid conflicting with `middlewares`
 * (direct `RequestHandler[]` references already supported by `ControllerEntry`).
 *
 * @param name    Middleware identifier — must match the string in `ControllerOptions.middlewareNames`.
 * @param handler Express-compatible handler function (typed `unknown` to avoid Express coupling).
 *
 * @example
 * ```ts
 * import { Middleware } from '@kerith/identifiers';
 *
 * Middleware('logger', (req, res, next) => {
 *   console.log((req as any).method, (req as any).path);
 *   (next as Function)();
 * });
 * ```
 */
export function Middleware(
  name: string,
  handler: (req: unknown, res: unknown, next: unknown) => void,
): void {
  // Called for future traceability — filePath not yet part of MiddlewarePlugin.
  getFileCallerInfo('Middleware()');

  const plugin = {
    phase: 'pre' as const,
    priority: 0,
    getHandlers(controller: unknown): unknown[] {
      // Requires controller.metadata?.middlewareNames (ControllerEntry extension — §0.3 resolved in Core).
      // If missing, it does not apply.
      const entry = controller as { metadata?: { middlewareNames?: string[] } } | null | undefined;
      if (!entry?.metadata?.middlewareNames?.includes(name)) return [];
      return [handler];
    },
  };

  registerMiddlewarePlugin(plugin);
}
