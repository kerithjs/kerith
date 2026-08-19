import { Controller } from '@kerith/app'
import { Router } from 'express'
import { dispatch } from '../../infrastructure/job.worker.js'
import { jobState } from '../../infrastructure/state.js'

Controller('/')

const router = Router()

// Hit this to trigger a job dispatch
router.get('/dispatch', (_req, res) => {
  dispatch()
  res.json({ dispatched: true })
})

// Hit this to read current job count
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    jobs: jobState.count,
  })
})

export default router
