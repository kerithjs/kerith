// src/events/message.ts
import { getFileCallerInfo } from '@kerith/core';
import { registerBindingPlugin } from '../channels/index.js';

export interface MessageOptions {
  group?: string;
  retries?: number;
}

/**
 * Registers a message event consumer.
 * 
 * Note: The binding data is opaque. `@kerith/app` and its specific
 * message brokers (like Kafka, RabbitMQ) are responsible for interpreting the `bind` payload.
 * 
 * @param topic   Topic or routing key to subscribe to.
 * @param handler Function to process the incoming message.
 * @param options Message binding options (group, retries).
 *
 * @example
 * ```ts
 * import { Message } from '@kerith/identifiers';
 * 
 * Message('user.created', async (msg) => {
 *   await sendWelcomeEmail(msg.userId);
 * }, { group: 'email-service' });
 * ```
 */
export function Message(
  topic: string,
  handler: (message: unknown) => void | Promise<void>,
  options: MessageOptions = {},
): void {
  const { filePath } = getFileCallerInfo('Message()');

  registerBindingPlugin({
    name: topic,
    filePath,
    kind: 'message',
    bind: { handler, options },
  });
}
