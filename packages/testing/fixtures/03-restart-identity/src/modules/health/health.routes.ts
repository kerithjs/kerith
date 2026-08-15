import { Module } from '@kerith/core'
import { Router } from 'express'

Module('health')

const router = Router()

router.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Hello from Kerith!' })
})

export default router
