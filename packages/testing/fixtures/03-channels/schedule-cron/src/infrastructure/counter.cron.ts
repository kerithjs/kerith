import { Cron } from '@kerith/app'

export let COUNTER = 0

Cron('increment-counter', '* * * * * *', () => {
  COUNTER++
})
