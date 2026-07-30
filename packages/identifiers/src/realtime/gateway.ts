// src/realtime/gateway.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerBindingPlugin } from '../channels/index.js';

export interface GatewayOptions {
  /**
   * Socket.io namespace path (e.g., '/chat', '/notifications').
   * @default '/'
   */
  namespace?: string;
  /**
   * Middleware functions for the Socket.io connection.
   * Consumed by the @kerith/app executor — not acted upon inside this package.
   */
  middleware?: Array<(socket: unknown, next: (err?: Error) => void) => void>;
  /**
   * Additional Socket.io server options.
   * Consumed by the @kerith/app executor — not acted upon inside this package.
   */
  options?: Record<string, unknown>;
}

/**
 * Registers a Socket.io gateway for real-time communication.
 *
 * Note: The binding data is opaque. `@kerith/app` and its specific
 * executor (Socket.io) are responsible for interpreting the `bind` payload.
 *
 * @param name    Identifier for this gateway.
 * @param handler Function to handle socket connections and events.
 * @param options Gateway configuration options.
 *
 * @example
 * ```ts
 * import { Gateway } from '@kerith/identifiers';
 *
 * Gateway('chat', (socket) => {
 *   socket.on('message', (data) => {
 *     // Handle incoming message
 *   });
 * }, { namespace: '/chat' });
 * ```
 */
export function Gateway(
  name: string,
  handler: (socket: unknown) => void,
  options: GatewayOptions = {},
): void {
  const { filePath } = getFileCallerInfo('Gateway()');

  registerBindingPlugin({
    name,
    filePath,
    kind: 'gateway',
    // Opaque data — @kerith/app decides how to pass this to the Socket.io engine.
    bind: { handler, options },
  });
}
