import { registerBindingProvider } from '@kerith/core'
import { getBindingPlugins } from '@kerith/identifiers'
import { loadSocketIOTransport } from '../adapters/socket-io.js'

interface GatewayBinding {
  handler: (socket: unknown) => void;
  options?: {
    namespace?: string;
    middleware?: Array<(socket: unknown, next: (err?: Error) => void) => void>;
    options?: Record<string, unknown>;
  };
}

export async function executeGatewayChannel() {
  for (const plugin of getBindingPlugins()) {
    if (plugin.kind === 'gateway') {
      registerBindingProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        kind: plugin.kind,
        bind: async () => {
          const transport = await loadSocketIOTransport()
          const { handler, options } = plugin.bind as GatewayBinding

          transport.bind(plugin.name, handler, options)
        }
      })
    }
  }
}
