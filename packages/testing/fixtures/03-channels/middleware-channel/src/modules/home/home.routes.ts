import { Controller } from '@kerith/app'
import { Router } from 'express'

Controller('/', { metadata: { middlewareNames: ['test-header'] } })

const router = Router()

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    customHeader: req.headers['x-kerith-test'] || 'missing'
  })
})

export default router
