// src/security/guard.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerMiddlewarePlugin } from '../channels/index.js';

export interface GuardOptions {
  /**
   * HTTP status code returned when the guard rejects the request.
   * @default 401
   */
  statusCode?: number;
  /**
   * JSON error message returned in the response body.
   * @default 'Unauthorized'
   */
  message?: string;
}

/**
 * Registers a named guard as a middleware plugin (phase: 'pre', priority: 1).
 *
 * The guard is applied only to controllers that declare it by name in
 * `ControllerOptions.guards` — e.g. `Controller('/users', { guards: ['jwt'] })`.
 * This requires `ControllerEntry.guards` to be present (resolved in Core — see §0.3).
 *
 * @param name    Guard identifier — must match the string used in `ControllerOptions.guards`.
 * @param check   Predicate that receives the raw Express request (typed `unknown` to avoid
 *                Express coupling in this package). Return `true` to allow, `false` to reject.
 * @param options Optional status code / message overrides.
 *
 * @example
 * ```ts
 * import { Guard } from '@kerith/identifiers';
 * import { verifyJwt } from '@shared/auth';
 *
 * Guard('jwt', (req) => verifyJwt((req as any).headers.authorization));
 * ```
 */
export function Guard(
  name: string,
  check: (req: unknown) => boolean | Promise<boolean>,
  options: GuardOptions = {},
): void {
  // Called for future traceability — filePath is not yet part of MiddlewarePlugin
  // (tracked in Extension API §5 "sin name/filePath para trazabilidad").
  getFileCallerInfo('Guard()');

  const plugin = {
    phase: 'pre' as const,
    priority: 1,
    getHandlers(controller: unknown): unknown[] {
      // Requires controller.metadata?.guards (ControllerEntry extension — §0.3 resolved in Core).
      // If missing, no guards are requested and thus we return NO handlers
      // for that controller, which is the safe default.
      const entry = controller as { metadata?: { guards?: string[] } } | null | undefined;
      console.log('GUARD GET_HANDLERS CALLED FOR:', (controller as any)?.name, 'ENTRY METADATA:', entry?.metadata)
      if (!entry?.metadata?.guards?.includes(name)) return [];

      return [
        async (req: unknown, res: unknown, next: unknown) => {
          const passed = await check(req);
          if (!passed) {
            const r = res as { status: (code: number) => { json: (body: unknown) => void } };
            return r.status(options.statusCode ?? 401).json({
              error: options.message ?? 'Unauthorized',
            });
          }
          (next as () => void)();
        },
      ];
    },
  };

  registerMiddlewarePlugin(plugin);
}
