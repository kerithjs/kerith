import { registerScheduleProvider } from '@kerith/core'
import { KerithError } from '@kerith/core'
import { getSchedulePlugins } from '@kerith/identifiers'
import { loadNodeCron } from '../adapters/node-cron.js'

export async function executeCronChannel() {
  for (const plugin of getSchedulePlugins()) {
    if (plugin.expression) {
      registerScheduleProvider({
        name: plugin.name,
        timing: 'after-bootstrap',
        execute: async () => {
          const cron = await loadNodeCron()
          
          if (!cron.validate(plugin.expression as string)) {
            throw new KerithError(
              'INVALID_CRON_EXPRESSION',
              `Cron expression "${plugin.expression}" in plugin "${plugin.name}" is invalid.`
            )
          }
          
          cron.schedule(plugin.expression as string, plugin.execute)
        },
      })
    }
  }
}
