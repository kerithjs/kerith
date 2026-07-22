import { registerAliasProvider } from '@kerith/core'
import { getAliasPlugins } from '@kerith/identifiers'

export function executeAliasChannel() {
  for (const plugin of getAliasPlugins()) {
    registerAliasProvider({
      prefix: plugin.prefix,
      name: plugin.name,
      filePath: plugin.filePath,
      resolve: plugin.resolve,
    })
  }
}
