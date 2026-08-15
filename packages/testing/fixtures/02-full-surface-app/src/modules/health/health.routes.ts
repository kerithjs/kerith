import { Controller } from '@kerith/app'
import { Router } from 'express'

Controller('/health')

const router = Router()

router.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Hello from Kerith!' })
})

export default router
