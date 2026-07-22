import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'
import { loadBullMQ } from '../adapters/bullmq.js'

export async function executeWorkerChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'worker') {
      registerBindingProvider({
        name: plugin.name,
        kind: plugin.kind,
        bind: async () => {
          const bullmq = await loadBullMQ()
          const { handler, options } = plugin.bind as any
          
          const opts = options || {}
          
          new bullmq.Worker(plugin.name, async (job) => {
            return handler(job)
          }, {
            concurrency: opts.concurrency,
          })
        }
      })
    }
  }
}
