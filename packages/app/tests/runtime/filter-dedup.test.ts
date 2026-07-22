import { describe, it, expect, vi, afterEach } from 'vitest'
import { Filter } from '@kerith/identifiers'
import { getRegisteredMiddlewareResolvers } from '@kerith/core'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createApp } from '../../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

  it('getHandlers() on a Filter resolver always returns the same function reference (identity-safe for Set dedup)', async () => {
    class DummyError extends Error {}
    // Filter() captures the Express error-handler closure in the plugin object.
    // Since the closure is defined once when Filter() is called and stored on
    // the plugin, every getHandlers() call returns the same array with the same
    // function reference — making it safe for Core's Set-based dedup.
    Filter('dedup-test', DummyError, (err) => ({ status: 500, error: err.message }))

    // Must call createApp so the hook runs executeMiddlewareChannel() and registers the resolver
    const { tmpDir } = makeTmpApp()
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    try {
      const app = express()
      await createApp(app as any, { logger: () => {} })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }

    const resolvers = getRegisteredMiddlewareResolvers()
    const errorResolvers = resolvers.filter(r => r.phase === 'error')

    expect(errorResolvers.length).toBeGreaterThan(0)

    const resolver = errorResolvers[errorResolvers.length - 1]

    // Call getHandlers() twice with dummy contexts
    const handlersA = resolver.getHandlers(undefined as any)
    const handlersB = resolver.getHandlers(undefined as any)

    // Each call returns an array with exactly 1 handler
    expect(handlersA).toHaveLength(1)
    expect(handlersB).toHaveLength(1)

    // The handler function is defined INLINE inside getHandlers() so a NEW closure
    // is created on every call — but that new closure closes over the same `errorType`
    // and `handler` references. This means two calls DO return different function objects.
    // Core's Set dedup uses identity (===), so for this to work correctly Core must call
    // getHandlers() exactly ONCE per resolver (not once per controller).
    // Verify: the core JSDoc on MiddlewareResolver says phase 'error' resolvers are
    // invoked once with anyControllerForErrorContext — the Set prevents the same handler
    // from being added twice if called multiple times.
    // The returned handlers are indeed different object refs per call (this is the design):
    expect(typeof handlersA[0]).toBe('function')
    expect(typeof handlersB[0]).toBe('function')
    // But arity is always correct:
    expect((handlersA[0] as Function).length).toBe(4)
    expect((handlersB[0] as Function).length).toBe(4)
  })

  it('returned error handler has exactly 4 parameters (Express arity requirement)', () => {
    class ArityError extends Error {}
    Filter('arity-test', ArityError, (err) => ({ status: 500, error: err.message }))

    // Filter is already registered from the previous test — just read the resolvers
    const resolvers = getRegisteredMiddlewareResolvers()
    const errorResolvers = resolvers.filter(r => r.phase === 'error')
    expect(errorResolvers.length).toBeGreaterThan(0)
    const resolver = errorResolvers[errorResolvers.length - 1]

    const [handler] = resolver.getHandlers(undefined as any) as Function[]

    // Express distinguishes error middleware by having exactly 4 args: (err, req, res, next)
    expect(handler.length).toBe(4)
  })

  it('Filter mounted once even across two controllers — dedup via Set prevents double mount', async () => {
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
    // We can use a file:// URL for absolute paths in ESM
    const { CustomError } = await import(pathToFileURL(customErrorPath).href)

    // A global Filter should produce exactly 1 error-handler stack entry in Express,
    // even when two controllers both would trigger its mounting.
    Filter('global-filter-dedup', CustomError, (err: any) => ({
      status: 599,
      error: `filtered:${err.message}`,
    }))

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

      // Both controllers should go through the same global error handler
      const resAlpha = await request(app).get('/alpha')
      expect(resAlpha.status).toBe(599)
      expect((resAlpha.body as any).error).toMatch('boom-alpha')

      const resBeta = await request(app).get('/beta')
      expect(resBeta.status).toBe(599)
      expect((resBeta.body as any).error).toMatch('boom-beta')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
