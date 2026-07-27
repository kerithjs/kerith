// src/adapters/stream.ts
import { createRedisClient } from './redis-streams.js'

export interface StreamTransport {
  bind(
    name: string,
    handler: (chunk: unknown) => Promise<void> | void,
    options?: Record<string, unknown>,
  ): () => void // Returns cleanup function
}

export async function loadStreamTransport(): Promise<StreamTransport> {
  return {
    bind(name, handler, options) {
      const batchSize = (options?.batchSize as number) ?? 1 // backpressure: 1 = procesa antes de pedir más
      let running = true

      void (async () => {
        let client = await createRedisClient()
        let lastId = '$' // arranca desde "ahora", no desde el principio del stream

        while (running) {
          try {
            const res = await client.xread('BLOCK', 5000, 'COUNT', batchSize, 'STREAMS', name, lastId)
            if (!res) continue
            for (const [, entries] of res as any[]) {
              for (const [id, fields] of entries) {
                await handler({ id, fields }) // no pide el siguiente batch hasta terminar — backpressure real
                lastId = id
              }
            }
          } catch (err: any) {
            if (!running) break // Exit if stopped during error handling
            console.error(`[Kerith] Stream consumption error for stream "${name}":`, err)
            // Backoff before retry
            await new Promise(resolve => setTimeout(resolve, 1000))
            // Reconnect on next iteration
            try {
              await client.quit()
            } catch {
              // Ignore quit errors
            }
            client = await createRedisClient()
          }
        }
        // Cleanup when loop stops
        try {
          await client.quit()
        } catch {
          // Ignore quit errors
        }
      })()

      // Return cleanup function for tests
      return () => {
        running = false
      }
    },
  }
}
