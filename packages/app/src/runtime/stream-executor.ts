import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'
import { loadStreamTransport } from '../adapters/stream.js'

interface StreamBinding {
  handler: (chunk: unknown) => Promise<void> | void;
  options?: Record<string, unknown>;
}

export async function executeStreamChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'stream') {
      registerBindingProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        kind: plugin.kind,
        bind: async () => {
          const transport = await loadStreamTransport()
          const { handler, options } = plugin.bind as StreamBinding
          
          transport.bind(plugin.name, handler, options)
        }
      })
    }
  }
}
