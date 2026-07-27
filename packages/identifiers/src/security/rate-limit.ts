// src/security/rate-limit.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerMiddlewarePlugin } from '../channels/index.js';

export interface RateLimitOptions {
  /**
   * Time window in milliseconds.
   * Consumed by the @kerith/app executor — not acted upon inside this package.
   */
  windowMs?: number;
  /**
   * Maximum number of requests allowed in the window.
   * Consumed by the @kerith/app executor — not acted upon inside this package.
   */
  max?: number;
  /**
   * JSON error message returned in the response body when the limit is exceeded.
   * @default 'Too Many Requests'
   */
  message?: string;
}

/**
 * Registers a named rate-limiter as a middleware plugin (phase: 'pre', priority: 2).
 *
 * Priority 2 means it runs before `Guard` (priority 1) and `Middleware` (priority 0).
 *
 * The rate-limiter is applied only to controllers that declare it by name in
 * `ControllerOptions.metadata.rateLimit` — e.g. `Controller('/public', { metadata: { rateLimit: 'api' } })`.
 * One rate-limiter per controller (string, not array). Requires `ControllerEntry.metadata.rateLimit`
 * to be present (resolved in Core — §0.3).
 *
 * @param name    Rate-limiter identifier — must match the string in `ControllerOptions.metadata.rateLimit`.
 * @param check   Predicate that returns `true` when the request is within the limit.
 * @param options Optional configuration (windowMs, max, message).
 *
 * @example
 * ```ts
 * import { RateLimit } from '@kerith/identifiers';
 *
 * RateLimit('api', (req) => checkApiQuota(req), { max: 100, windowMs: 60_000 });
 * ```
 */
export function RateLimit(
  name: string,
  check: (req: unknown) => boolean | Promise<boolean>,
  options: RateLimitOptions = {},
): void {
  const { filePath } = getFileCallerInfo('RateLimit()');

  const plugin = {
    name,
    filePath,
    phase: 'pre' as const,
    priority: 2,
    getHandlers(controller: unknown): unknown[] {
      // Requires controller.metadata?.rateLimit (ControllerEntry extension — §0.3 resolved in Core).
      // If missing, it does not apply.
      const entry = controller as { metadata?: { rateLimit?: string } } | null | undefined;
      if (entry?.metadata?.rateLimit !== name) return [];

      return [
        async (req: unknown, res: unknown, next: unknown) => {
          const allowed = await check(req);
          if (!allowed) {
            const r = res as { status: (code: number) => { json: (body: unknown) => void } };
            return r.status(429).json({ error: options.message ?? 'Too Many Requests' });
          }
          (next as () => void)();
        },
      ];
    },
  };

  registerMiddlewarePlugin(plugin);
}
