// src/adapters/stream.ts
// Lazy-loaded adapter for the stream transport.
// Follows the same pattern as loadBullMQ() and loadNodeCron().
// Replace the stub body with a real import (Kafka Streams, Redis Streams, etc.)
// once the engine is decided — see section 5.3 of the design backlog.

export interface StreamTransport {
  bind(
    name: string,
    handler: (chunk: unknown) => Promise<void> | void,
    options?: Record<string, unknown>,
  ): void
}

export async function loadStreamTransport(): Promise<StreamTransport> {
  // TODO (5.3): swap this stub for a real peer import once the stream engine is chosen.
  //   Kafka Streams → await import('kafkajs')
  //   Redis Streams → await import('ioredis')
  // Throw KerithError('MISSING_PEER_DEPENDENCY', ...) if the import fails,
  // exactly like loadBullMQ() does.
  return {
    bind(name, _handler, _options) {
      console.log(`[Kerith] Stream transport not yet configured for: ${name}`)
    },
  }
}
