import { Controller } from '@kerith/core'
import { Router } from 'express'

Controller('/store')

const router = Router()

router.get('/', (_req, res) => {
  res.json({ items: ['item-A', 'item-B'] })
})

export default router
