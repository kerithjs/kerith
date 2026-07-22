import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'

async function loadMessageTransport() {
  return {
    bind: (name: string, handler: any, options: any) => {
      console.log(`[Kerith] Message transport binding placeholder for: ${name}`)
    }
  }
}

export async function executeMessageChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'message') {
      registerBindingProvider({
        name: plugin.name,
        kind: plugin.kind,
        bind: async () => {
          const transport = await loadMessageTransport()
          const { handler, options } = plugin.bind as any
          
          transport.bind(plugin.name, handler, options)
        }
      })
    }
  }
}
