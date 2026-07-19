// src/observability/probe.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerSchedulePlugin } from '../channels/index.js';

/**
 * Registers a readiness/liveness probe.
 * 
 * Note: Exposing the HTTP route (e.g., `/ready` or `/live`) is currently out of scope
 * for the schedule channel. The check runs via the internal `@kerith/app` schedule executor.
 * 
 * @param name  Identifier for this probe.
 * @param check Function returning boolean representing readiness/liveness.
 *
 * @example
 * ```ts
 * import { Probe } from '@kerith/identifiers';
 * 
 * Probe('memory-usage', () => {
 *   return process.memoryUsage().heapUsed < 1024 * 1024 * 500; // < 500MB
 * });
 * ```
 */
export function Probe(
  name: string,
  check: () => boolean | Promise<boolean>,
): void {
  getFileCallerInfo('Probe()');

  registerSchedulePlugin({
    name: `probe:${name}`,
    timing: 'on-listen',
    execute: async () => {
      // Current scope: execute the check.
      // Route aggregation is handled outside of this module.
      await check();
    },
  });
}
