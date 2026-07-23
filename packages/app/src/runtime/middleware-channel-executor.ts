import { registerMiddlewareResolver } from '@kerith/core'
import { getMiddlewarePlugins } from '@kerith/identifiers'

export function executeMiddlewareChannel() {
  for (const plugin of getMiddlewarePlugins()) {
    registerMiddlewareResolver({
      name: plugin.name,
      filePath: plugin.filePath,
      phase: plugin.phase,
      priority: plugin.priority,
      getHandlers: plugin.getHandlers,
    })
  }
}
