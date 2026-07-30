import { registerScheduleProvider } from '@kerith/core'
import { getSchedulePlugins } from '@kerith/identifiers'

export function executeSchedulePassthroughChannel() {
  for (const plugin of getSchedulePlugins()) {
    if (!plugin.expression) {
      registerScheduleProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        timing: plugin.timing,
        execute: plugin.execute,
      })
    }
  }
}
