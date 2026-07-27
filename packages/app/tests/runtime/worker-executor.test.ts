import { describe, it, expect, vi, afterEach } from 'vitest'
import { Worker } from '@kerith/identifiers'
import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Worker Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verifies Worker plugin correctly binds to BullMQ and executes job', async () => {
    const jobPayload = { message: 'hello from mock' }
    let handlerExecuted = false

    Worker('test-worker', async (job: any) => {
      expect(job.data).toEqual(jobPayload)
      handlerExecuted = true
    }, { concurrency: 5 })

    vi.doMock('../../src/adapters/bullmq.js', () => {
      return {
        loadBullMQ: async () => ({
          Worker: class MockWorker {
            constructor(name: string, processor: Function, options: any) {
              expect(name).toBe('test-worker')
              expect(options.concurrency).toBe(5)
              // Verify that connection comes from getRedisConnection(), not hardcoded
              expect(options.connection).toEqual({
                host: 'redis.example.com',
                port: 6380,
                password: 'secret123'
              })
              setTimeout(() => processor({ data: jobPayload }), 10)
            }
          }
        })
      }
    })
    vi.doMock('../../src/adapters/redis-connection.js', () => {
      return {
        getRedisConnection: () => ({
          host: 'redis.example.com',
          port: 6380,
          password: 'secret123'
        })
      }
    })

    const { createApp } = await import('../../src/index.js')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-worker-'))
    
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
    fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

    const moduleDir = path.join(tmpDir, 'src/modules/test')
    fs.mkdirSync(moduleDir, { recursive: true })
    
    fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')
    
    fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
      import { Module } from '@kerith/core'
      Module('test')
    `)

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      const kerithApp = await createApp(app as any, { logger: () => {} })
      
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(handlerExecuted).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      vi.doUnmock('../../src/adapters/bullmq.js')
    }
  })
})
