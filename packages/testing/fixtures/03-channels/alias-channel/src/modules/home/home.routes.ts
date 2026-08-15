import { Controller } from '@kerith/app'
import { Router } from 'express'
import { FEATURE_FLAGS } from '../../infrastructure/flags.alias.js'

Controller('/')

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    featureFlag: FEATURE_FLAGS.v2
  })
})

export default router
