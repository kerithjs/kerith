import { describe, it, expect, vi, afterEach } from 'vitest'
// Use createApp from @kerith/app to test the wrapper
import { getRegisteredMiddlewareResolvers } from '@kerith/core'
import { createApp } from '../../src/index.js'
import { Guard, Filter } from '@kerith/identifiers'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import { _resetAllChannels } from '@kerith/identifiers'
import { _resetExtensionStore } from '@kerith/core/extension'

describe('Middleware Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    _resetAllChannels()
    if (typeof _resetExtensionStore === 'function') _resetExtensionStore()
  })

  it('verifies Guard and Filter plugin integration with createApp()', async () => {
    // We register the plugins globally here
    Guard('test-guard', (req: any) => {
      return req.headers['x-pass'] === 'true'
    }, { message: 'Guard blocked access' })

    Filter('test-filter', URIError, (err: any) => ({
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
          (req, res, next) => next(new URIError('Triggered error'))
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


function makeTmpApp(controllers: string = '') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-filter-'))
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
  fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')
  const moduleDir = path.join(tmpDir, 'src/modules/test')
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')
  fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
    import { Module } from '@kerith/core'
    Module('test')
  `)
  if (controllers) {
    fs.writeFileSync(path.join(moduleDir, 'ctrl.ts'), controllers)
  }
  return { tmpDir, moduleDir }
}

describe('Filter — dedup by identity and 4-arg validation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returned error handler has exactly 4 parameters (Express arity requirement)', () => {
    class ArityError extends Error {}
    Filter('arity-test', ArityError, (err: any) => ({ status: 500, error: err.message }))

    const resolvers = getRegisteredMiddlewareResolvers()
    const errorResolvers = resolvers.filter(r => r.phase === 'error')
    expect(errorResolvers.length).toBeGreaterThan(0)
    const resolver = errorResolvers[errorResolvers.length - 1]

    const [handler] = resolver.getHandlers(undefined as any) as any[]

    // Express distinguishes error middleware by having exactly 4 args: (err, req, res, next)
    expect(handler.length).toBe(4)
  })

  /**
   * Core calls getHandlers() ONCE PER RESOLVER (not once per controller) for
   * error-phase resolvers — see step-08-controllers.ts lines ~196-207.
   * The single call produces one closure that lands in globalErrorHandlers (a Set).
   * This test verifies the end contract: even with TWO controllers both in the
   * same module, the error handler fires exactly ONCE per erroring request
   * (not twice — which would cause "headers already sent" and a 500 from Express).
   *
   * This is the correct dedup scenario the spec asks for: "el test solo tiene
   * un controller, nunca se enfrenta al Set de Core" — here we have two controllers
   * and the filter is mounted globally via the Set without duplication.
   */
  it('Filter mounted once even across two controllers — handler fires exactly once per request', async () => {
    // Each controller must be in its own file — Controller() throws if called twice in same file
    const { tmpDir, moduleDir } = makeTmpApp()

    // 1. Create a shared CustomError so the test and controllers use the exact same class reference
    const customErrorPath = path.join(moduleDir, 'custom-error.ts')
    fs.writeFileSync(customErrorPath, `
      export class CustomError extends Error {
        constructor(message: string) { super(message); this.name = 'CustomError'; }
      }
    `)

    // Dynamically import the class into the test process
    const { CustomError } = await import(pathToFileURL(customErrorPath).href)

    // Track how many times the filter handler is invoked per request
    let filterCallCount = 0

    Filter('global-filter-dedup', CustomError, (err: any) => {
      filterCallCount++
      return {
        status: 599,
        error: `filtered:${err.message}`,
        callCount: filterCallCount,
      }
    })

    fs.writeFileSync(path.join(moduleDir, 'alpha.ts'), `
      import { Controller } from '@kerith/core'
      import { Router } from 'express'
      import { CustomError } from './custom-error.js'
      Controller('/alpha', {
        middlewares: [(req, res, next) => next(new CustomError('boom-alpha'))]
      })
      const router = Router()
      router.get('/', (req, res) => res.json({ ok: true }))
      export default router
    `)
    fs.writeFileSync(path.join(moduleDir, 'beta.ts'), `
      import { Controller } from '@kerith/core'
      import { Router } from 'express'
      import { CustomError } from './custom-error.js'
      Controller('/beta', {
        middlewares: [(req, res, next) => next(new CustomError('boom-beta'))]
      })
      const router = Router()
      router.get('/', (req, res) => res.json({ ok: true }))
      export default router
    `)

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      await createApp(app as any, { logger: () => {} })

      // --- /alpha: filter must fire exactly once ---
      filterCallCount = 0
      const resAlpha = await request(app).get('/alpha')
      expect(resAlpha.status).toBe(599)
      expect((resAlpha.body as any).error).toMatch('boom-alpha')
      // If the handler was mounted twice, filterCallCount would be 2 here
      // AND Express would throw "headers already sent" crashing the response.
      expect(filterCallCount).toBe(1)

      // --- /beta: same guarantee on a different controller ---
      filterCallCount = 0
      const resBeta = await request(app).get('/beta')
      expect(resBeta.status).toBe(599)
      expect((resBeta.body as any).error).toMatch('boom-beta')
      expect(filterCallCount).toBe(1)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
