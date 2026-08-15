import { registerScheduleProvider } from '@kerith/core'

export let GOOD_PROVIDER_RAN = false

registerScheduleProvider({
  name: 'good-provider',
  filePath: import.meta.url,
  timing: 'after-bootstrap',
  execute: async () => {
    GOOD_PROVIDER_RAN = true
  }
})

registerScheduleProvider({
  name: 'broken-provider',
  filePath: import.meta.url,
  timing: 'after-bootstrap',
  execute: async () => {
    throw new Error('This provider is broken')
  }
})
