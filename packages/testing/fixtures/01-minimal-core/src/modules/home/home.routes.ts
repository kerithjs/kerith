import { Controller } from '@kerith/core'
import { Router } from 'express'

Controller('/')

const router = Router()

router.get('/', (_req, res) => {
  res.json({ message: 'Hello World! Welcome to Kerith Express' })
})

export default router
