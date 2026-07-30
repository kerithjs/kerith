import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { _resetExtensionStore } from '@kerith/core'
import { _resetAllChannels } from '@kerith/identifiers'

// Mock infrastructure dependencies so the test runs fully in-memory
vi.mock('../../src/adapters/bullmq.js', () => ({
  loadBullMQ: vi.fn(async () => ({
    Worker: class MockWorker {
      constructor(_name: string, _handler: any, _opts: any) {}
    },
  })),
}))

vi.mock('../../src/adapters/redis-connection.js', () => ({
  getRedisConnection: vi.fn(() => ({})), // mock redis instance
}))

vi.mock('../../src/adapters/socket-io.js', () => ({
  loadSocketIOTransport: vi.fn(async () => ({
    attach: vi.fn(),
    bind: vi.fn(),
  })),
}))

vi.mock('../../src/adapters/node-cron.js', () => ({
  loadCron: vi.fn(async () => ({
    schedule: vi.fn(),
  })),
}))

describe('Full Stack Integration (All Channels)', () => {
  beforeEach(() => {
    _resetExtensionStore()
    _resetAllChannels()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    _resetExtensionStore()
    _resetAllChannels()
  })

  it('boots up an app with Alias, Middleware, Cron, Worker, Gateway, Controller and Module combined', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-fullstack-'))
    fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')
    
    // Create necessary Kerith app structure
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
    fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

    const moduleDir = path.join(tmpDir, 'src/modules/test')
    fs.mkdirSync(moduleDir, { recursive: true })
    
    // File 1: Alias
    fs.writeFileSync(path.join(moduleDir, 'alias.ts'), `
      import { Client } from '@kerith/identifiers'
      export default Client('db', () => ({ connected: true }))
    `)

    // File 2: Middleware
    fs.writeFileSync(path.join(moduleDir, 'middleware.ts'), `
      import { Middleware } from '@kerith/identifiers'
      export default Middleware('auth', (req, res, next) => next())
    `)

    // File 3: Cron
    fs.writeFileSync(path.join(moduleDir, 'cron.ts'), `
      import { Cron } from '@kerith/identifiers'
      export default Cron('daily-report', '0 0 * * *', () => {})
    `)

    // File 4: Worker
    fs.writeFileSync(path.join(moduleDir, 'worker.ts'), `
      import { Worker } from '@kerith/identifiers'
      export default Worker('email-queue', async (job) => {})
    `)

    // File 5: Gateway
    fs.writeFileSync(path.join(moduleDir, 'gateway.ts'), `
      import { Gateway } from '@kerith/identifiers'
      export default Gateway('chat', (socket) => {})
    `)

    // File 6: Controller
    fs.writeFileSync(path.join(moduleDir, 'controller.ts'), `
      import { Controller } from '@kerith/core'
      import { Router } from 'express'
      export default Controller('api', { middlewares: ['auth'] })(class {
        get(req, res) { res.send('ok') }
      })
      const router = Router()
      router.get('/', (req, res) => res.json({ ok: true }))
      export const route = router
    `)

    // File 7: Module
    fs.writeFileSync(path.join(moduleDir, 'module.ts'), `
      import { Module } from '@kerith/core'
      export default Module('app-module', {
        controllers: ['api'],
        providers: ['db'],
      })(class {})
    `)

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      // 2. Boot app
      const { createApp } = await import('../../src/index.js')
      const app = express()
      
      const kerithApp = await createApp(app as any, { logger: () => {} })

      // Verify Kerith initialized correctly
      expect(kerithApp).toBeDefined()
      expect(typeof kerithApp.listen).toBe('function')
      
      // Simulate server listen
      const mockServer = {
        on: vi.fn(),
      } as any
      await kerithApp.listen(mockServer)

      // If it reaches here without throwing, the integration works
      expect(true).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
