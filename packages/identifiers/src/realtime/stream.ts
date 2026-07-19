// src/realtime/stream.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerBindingPlugin } from '../channels/index.js';

export interface StreamOptions {
  backpressure?: boolean;
}

/**
 * Registers a stream processor.
 * 
 * Note: The binding data is opaque. `@kerith/app` and its specific
 * streaming engines (like WebSockets, SSE, or Kafka Streams) are responsible
 * for interpreting the `bind` payload.
 * 
 * @param name    Identifier for this stream.
 * @param handler Function to process chunks from the stream.
 * @param options Stream configuration options (e.g., backpressure).
 *
 * @example
 * ```ts
 * import { Stream } from '@kerith/identifiers';
 * 
 * Stream('audio-chunks', async (chunk) => {
 *   await processAudio(chunk);
 * }, { backpressure: true });
 * ```
 */
export function Stream(
  name: string,
  handler: (chunk: unknown) => void | Promise<void>,
  options: StreamOptions = {},
): void {
  getFileCallerInfo('Stream()');

  registerBindingPlugin({
    name,
    kind: 'stream',
    // Opaque data — @kerith/app decides how to bind this to a streaming source.
    bind: { handler, options },
  });
}
