// src/adapters/message.ts
import { createRedisClient } from './redis-streams.js'
import { createLogger } from '@kerith/core'

const logger = createLogger('kerith')

export interface MessageTransport {
  bind(
    name: string,
    handler: (message: unknown) => Promise<void> | void,
    options?: Record<string, unknown>,
  ): () => void // Returns cleanup function
}

export async function loadMessageTransport(): Promise<MessageTransport> {
  return {
    bind(name, handler, options) {
      const group = (options?.group as string) ?? 'kerith'
      const consumer = (options?.consumer as string) ?? `${name}-${process.pid}`
      let running = true

      void (async () => {
        let client = await createRedisClient()

        // Consumption loop with error handling and retry
        while (running) {
          try {
            // Create consumer group if it doesn't exist
            try {
              await client.xgroup('CREATE', name, group, '$', 'MKSTREAM')
            } catch (err: any) {
              if (!String(err?.message).includes('BUSYGROUP')) throw err // group already exists, ok
            }

            // Consumption loop
            while (running) {
              const res = await client.xreadgroup(
                'GROUP', group, consumer, 'BLOCK', 5000, 'COUNT', 10, 'STREAMS', name, '>'
              )
              if (!res) continue
              for (const [, entries] of res as any[]) {
                for (const [id, fields] of entries) {
                  await handler({ id, fields })
                  await client.xack(name, group, id)
                }
              }
            }
          } catch (err: any) {
            if (!running) break // Exit if stopped during error handling
            logger.error(`Message consumption error for stream "${name}"`, { err })
            // Exponential backoff before retry
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
