import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'

async function loadStreamTransport() {
  return {
    bind: (name: string, handler: any, options: any) => {
      console.log(`[Kerith] Stream transport binding placeholder for: ${name}`)
    }
  }
}

export async function executeStreamChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'stream') {
      registerBindingProvider({
        name: plugin.name,
        kind: plugin.kind,
        bind: async () => {
          const transport = await loadStreamTransport()
          const { handler, options } = plugin.bind as any
          
          transport.bind(plugin.name, handler, options)
        }
      })
    }
  }
}
