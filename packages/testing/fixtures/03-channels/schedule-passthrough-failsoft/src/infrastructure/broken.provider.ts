import { registerScheduleProvider } from '@kerith/core'

/**
 * Intentionally broken provider — its execute() throws immediately.
 * The 'after-bootstrap' schedules in core are wrapped in try/catch,
 * so this error is caught, logged, and boot continues (fail-soft).
 */
registerScheduleProvider({
  name: 'broken-provider',
  filePath: import.meta.url,
  timing: 'after-bootstrap',
  execute: async () => {
    throw new Error('Intentional provider failure — this should be swallowed by fail-soft')
  },
})
