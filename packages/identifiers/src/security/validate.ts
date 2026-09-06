// src/security/validate.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerMiddlewarePlugin } from '../channels/index.js';

export interface ValidatableSchema {
  parse(data: unknown): unknown;
}

export interface ValidateOptions {
  /**
   * HTTP status code returned when validation fails.
   * @default 400
   */
  statusCode?: number;
  /**
   * JSON error message returned in the response body.
   * @default 'Validation failed'
   */
  message?: string;
}

/**
 * Registers a named body-validator as a middleware plugin (phase: 'pre', priority: 0.5).
 *
 * Priority 0.5 means it runs before `Middleware` (priority 0) and after `Guard` (priority 1).
 *
 * The validator is applied only to controllers that declare it by name in
 * `ControllerOptions.metadata.validate` — e.g. `Controller('/users', { metadata: { validate: 'create-user' } })`.
 * One validator per controller (string, not array). Requires `ControllerEntry.metadata.validate`
 * to be present (resolved in Core — §0.3).
 *
 * @param name    Validator identifier — must match the string in `ControllerOptions.metadata.validate`.
 * @param schema  Any object with a `.parse(data)` method that throws on
 *                invalid input (Zod, Valibot, etc.).
 * @param options Optional status code / message overrides.
 *
 * @example
 * ```ts
 * import { Validate } from '@kerith/identifiers';
 * import { z } from 'zod';
 *
 * const CreateUserSchema = z.object({ name: z.string(), age: z.coerce.number() });
 *
 * Validate('create-user', CreateUserSchema);
 * ```
 */
export function Validate(
  name: string,
  schema: ValidatableSchema,
  options: ValidateOptions = {},
): void {
  const { filePath } = getFileCallerInfo('Validate()');

  const plugin = {
    name,
    filePath,
    phase: 'pre' as const,
    priority: 0.5,
    getHandlers(controller: unknown): unknown[] {
      // Requires controller.metadata?.validate (ControllerEntry extension — §0.3 resolved in Core).
      const entry = controller as { metadata?: { validate?: string } } | null | undefined;
      console.log('Validate getHandlers for', name, 'on', entry?.metadata); if (entry?.metadata?.validate !== name) return []; console.log('Validate matches!');

      return [
        async (req: unknown, res: unknown, next: unknown) => {
          const r = req as { body?: unknown };
          try {
            r.body = await schema.parse(r.body);
            (next as () => void)();
          } catch (err: unknown) {
            const response = res as { status: (code: number) => { json: (body: unknown) => void } };
            response.status(options.statusCode ?? 400).json({
              error: options.message ?? 'Validation failed',
              details: (err as any)?.issues ?? (err as any)?.errors ?? (err instanceof Error ? err.message : String(err)),
            });
          }
        },
      ];
    },
  };

  registerMiddlewarePlugin(plugin);
}

