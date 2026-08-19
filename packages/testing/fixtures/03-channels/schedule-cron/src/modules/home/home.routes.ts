import { Controller } from '@kerith/app'
import { Router } from 'express'
import { COUNTER } from '../../infrastructure/counter.cron.js'

Controller('/')

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    count: COUNTER
  })
})

export default router
