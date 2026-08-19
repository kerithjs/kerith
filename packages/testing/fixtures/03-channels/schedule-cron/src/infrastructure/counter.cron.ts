import { Cron } from '@kerith/app'

export let COUNTER = 0

Cron('increment-counter', '* * * * * *', () => {
  if (COUNTER < 1) COUNTER++
})
