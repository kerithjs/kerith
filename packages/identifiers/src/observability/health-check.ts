// src/observability/health-check.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerSchedulePlugin } from '../channels/index.js';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  [key: string]: unknown;
}

/**
 * Registers a health check that will be evaluated to determine application health.
 * 
 * Note: Exposing the HTTP route (e.g., `/health`) is currently out of scope for the
 * schedule channel. The check runs via the internal `@kerith/app` schedule executor.
 * 
 * @param name  Identifier for this health check.
 * @param check Function returning the health status.
 *
 * @example
 * ```ts
 * import { HealthCheck } from '@kerith/identifiers';
 * 
 * HealthCheck('database', async () => {
 *   const isUp = await pingDb();
 *   return { status: isUp ? 'healthy' : 'unhealthy' };
 * });
 * ```
 */
export function HealthCheck(
  name: string,
  check: () => HealthCheckResult | Promise<HealthCheckResult>,
): void {
  const { filePath } = getFileCallerInfo('HealthCheck()');

  registerSchedulePlugin({
    name: `health-check:${name}`,
    filePath,
    timing: 'after-bootstrap',
    execute: async () => {
      // Current scope: execute the check.
      // Route aggregation is handled outside of this module.
      await check();
    },
  });
}
