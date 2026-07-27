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
          const redisConnection = getRedisConnection()

          new bullmq.Worker(plugin.name, async (job) => {
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
