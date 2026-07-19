// src/workers/worker.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerBindingPlugin } from '../channels/index.js';

export interface WorkerOptions {
  concurrency?: number;
  retryOnFail?: boolean;
  timeout?: number;
}

/**
 * Registers a worker that processes background jobs.
 * 
 * Note: The binding data is opaque. `@kerith/app` and its specific
 * executors (like BullMQ) are responsible for interpreting the `bind` payload.
 * 
 * @param name    Identifier for this worker.
 * @param handler Function to process the job payload.
 * @param options Worker configuration options.
 *
 * @example
 * ```ts
 * import { Worker } from '@kerith/identifiers';
 * 
 * Worker('send-email', async (job) => {
 *   await mailer.send(job.data);
 * }, { concurrency: 5 });
 * ```
 */
export function Worker(
  name: string,
  handler: (job: unknown) => void | Promise<void>,
  options: WorkerOptions = {},
): void {
  getFileCallerInfo('Worker()');

  registerBindingPlugin({
    name,
    kind: 'worker',
    // Opaque data — @kerith/app decides how to pass this to the queue engine.
    bind: { handler, options },
  });
}
