// src/workers/cron.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerSchedulePlugin } from '../channels/index.js';

export interface CronOptions {
  /**
   * Timezone for the cron expression (e.g. 'America/New_York').
   * Consumed by the @kerith/app executor.
   */
  timezone?: string;
  /**
   * If true, runs the job immediately on initialization.
   * Consumed by the @kerith/app executor.
   */
  runOnInit?: boolean;
}

/**
 * Registers a scheduled job using a cron expression.
 * The job is executed by the @kerith/app schedule executor.
 *
 * Validation of the cron expression is NOT performed here — it is handled
 * at runtime by the executor, which throws `INVALID_CRON_EXPRESSION` if malformed.
 *
 * @param name       Identifier for this cron job.
 * @param expression A valid cron expression (e.g., `'0 2 * * *'`).
 * @param fn         The function to execute when the schedule triggers.
 * @param options    Optional execution settings (timezone, runOnInit).
 *
 * @example
 * ```ts
 * import { Cron } from '@kerith/identifiers';
 *
 * Cron('daily-cleanup', '0 2 * * *', async () => {
 *   await cleanupDatabase();
 * });
 * ```
 */
export function Cron(
  name: string,
  expression: string,
  fn: () => void | Promise<void>,
  options: CronOptions = {},
): void {
  const { filePath } = getFileCallerInfo('Cron()');

  // `options` are silently accepted but unused in this plugin shape
  // per the Extension API §7. If they need to be passed down later,
  // SchedulePlugin would need to be updated to support an `options` object.
  void options;

  registerSchedulePlugin({
    name: `cron:${name}`,
    filePath,
    timing: 'after-bootstrap',
    expression,
    execute: fn,
  });
}
