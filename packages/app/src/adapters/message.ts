// src/adapters/message.ts
// Lazy-loaded adapter for the message transport.
// Follows the same pattern as loadBullMQ() and loadNodeCron().
// Replace the stub body with a real import (Kafka, RabbitMQ, etc.)
// once the transport is decided — see section 5.3 of the design backlog.

export interface MessageTransport {
  bind(
    name: string,
    handler: (message: unknown) => Promise<void> | void,
    options?: Record<string, unknown>,
  ): void
}

export async function loadMessageTransport(): Promise<MessageTransport> {
  // TODO (5.3): swap this stub for a real peer import once the transport is chosen.
  //   Kafka  → await import('kafkajs')
  //   RabbitMQ → await import('amqplib')
  // Throw KerithError('MISSING_PEER_DEPENDENCY', ...) if the import fails,
  // exactly like loadBullMQ() does.
  return {
    bind(name, _handler, _options) {
      console.log(`[Kerith] Message transport not yet configured for: ${name}`)
    },
  }
}
