import { Controller } from '@kerith/app'
import { Router } from 'express'
import { GOOD_PROVIDER_RAN } from '../../infrastructure/mixed.providers.js'

Controller('/')

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    goodProviderRan: GOOD_PROVIDER_RAN
  })
})

export default router
