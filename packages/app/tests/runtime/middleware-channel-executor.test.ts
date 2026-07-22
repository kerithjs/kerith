import { describe, it, expect, vi, afterEach } from 'vitest'
// Use createApp from @kerith/app to test the wrapper
import { createApp } from '../../src/index.js'
import { Guard, Filter } from '@kerith/identifiers'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Middleware Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verifies Guard and Filter plugin integration with createApp()', async () => {
    // We register the plugins globally here
    Guard('test-guard', (req: any) => {
      return req.headers['x-pass'] === 'true'
    }, { message: 'Guard blocked access' })

    Filter('test-filter', Error, (err) => ({
      status: 500,
      error: err.message,
      customError: err.message,
    }))

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-'))
    
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
    fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

    const moduleDir = path.join(tmpDir, 'src/modules/test')
    fs.mkdirSync(moduleDir, { recursive: true })
    
    fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')
    
    fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
      import { Module } from '@kerith/core'
      Module('test')
    `)

    fs.writeFileSync(path.join(moduleDir, 'guarded.ts'), `
      import { Controller } from '@kerith/core'
      import { Router } from 'express'
      
      Controller('/guarded', { 
        metadata: { guards: ['test-guard'] },
        middlewares: [
          (req, res, next) => next() // Just pass through, the route handles the response
        ]
      })

      const router = Router()
      router.get('/', (req, res) => res.status(200).json({ ok: true }))
      export default router
    `)

    fs.writeFileSync(path.join(moduleDir, 'error.ts'), `
      import { Controller } from '@kerith/core'
      import { Router } from 'express'

      Controller('/error', {
        metadata: { middlewareNames: ['test-filter'] },
        middlewares: [
          (req, res, next) => next(new Error('Triggered error'))
        ]
      })

      const router = Router()
      router.get('/', (req, res) => res.status(200).json({ ok: true }))
      export default router
    `)

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      app.use(express.json())
      
      await createApp(app as any, { logger: () => {} })

      const resSuccess = await request(app).get('/guarded').set('x-pass', 'true')
      expect(resSuccess.status).toBe(200)
      expect(resSuccess.body).toEqual({ ok: true })

      const resFail = await request(app).get('/guarded').set('x-pass', 'false')
      expect(resFail.status).toBe(401)
      expect(resFail.body).toHaveProperty('error', 'Guard blocked access')

      const resError = await request(app).get('/error')
      expect(resError.status).toBe(500)
      expect(resError.body).toEqual({
        status: 500,
        error: 'Triggered error',
        customError: 'Triggered error',
      })
      
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
