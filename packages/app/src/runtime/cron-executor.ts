import { registerScheduleProvider } from '@kerith/core'
import { KerithError } from '@kerith/core'
import { getSchedulePlugins } from '@kerith/identifiers'
import { loadNodeCron } from '../adapters/node-cron.js'

export async function executeCronChannel() {
  for (const plugin of getSchedulePlugins()) {
    const expression = plugin.expression
    if (expression) {
      const cron = await loadNodeCron()
      
      if (!cron.validate(expression)) {
        throw new KerithError(
          'INVALID_CRON_EXPRESSION',
          `Cron expression "${expression}" in plugin "${plugin.name}" is invalid.`
        )
      }

      registerScheduleProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        timing: 'after-bootstrap',
        execute: async () => {
          cron.schedule(expression, plugin.execute)
        },
      })
    }
  }
}
