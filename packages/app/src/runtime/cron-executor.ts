import { registerScheduleProvider } from '@kerith/core'
import { KerithError } from '@kerith/core'
import { getSchedulePlugins } from '@kerith/identifiers'
import { loadNodeCron } from '../adapters/node-cron.js'

export async function executeCronChannel() {
  for (const plugin of getSchedulePlugins()) {
    const expression = plugin.expression
    if (expression) {
      registerScheduleProvider({
        name: plugin.name,
        filePath: plugin.filePath,
        timing: 'after-bootstrap',
        execute: async () => {
          const cron = await loadNodeCron()
          
          if (!cron.validate(expression)) {
            throw new KerithError(
              'INVALID_CRON_EXPRESSION',
              `Cron expression "${expression}" in plugin "${plugin.name}" is invalid.`
            )
          }
          
          cron.schedule(expression, plugin.execute)
        },
      })
    }
  }
}
