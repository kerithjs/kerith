import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'
import { loadMessageTransport } from '../adapters/message.js'

interface MessageBinding {
  handler: (message: unknown) => Promise<void> | void;
  options?: Record<string, unknown>;
}

export async function executeMessageChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'message') {
      registerBindingProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        kind: plugin.kind,
        bind: async () => {
          const transport = await loadMessageTransport()
          const { handler, options } = plugin.bind as MessageBinding
          
          transport.bind(plugin.name, handler, options)
        }
      })
    }
  }
}
