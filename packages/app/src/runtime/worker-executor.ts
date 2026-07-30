import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'
import { loadBullMQ } from '../adapters/bullmq.js'
import { getRedisConnection } from '../adapters/redis-connection.js'

interface WorkerBinding {
  handler: (job: unknown) => Promise<void> | void;
  options?: {
    concurrency?: number;
  };
}

export async function executeWorkerChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'worker') {
      registerBindingProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        kind: plugin.kind,
        bind: async () => {
          const bullmq = await loadBullMQ()
          const { handler, options } = plugin.bind as WorkerBinding

          const opts = options || {}
          const { getInfrastructureOptions } = await import('./infrastructure-context.js')
          const redisConnection = getRedisConnection(getInfrastructureOptions()?.redis)

          // BullMQ v5 breaking change: connection object is now mandatory.
          // In v4 it showed a warning; v5 throws an error without it.
          new bullmq.Worker(plugin.name, async (job: any) => {
            return handler(job)
          }, {
            concurrency: opts.concurrency,
            connection: redisConnection
          })
        }
      })
    }
  }
}
