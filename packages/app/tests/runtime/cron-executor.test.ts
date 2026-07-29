import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('node-cron', () => ({
  default: {
    validate: (expr: string) => expr !== 'this is not a cron',
    schedule: vi.fn()
  },
  validate: (expr: string) => expr !== 'this is not a cron',
  schedule: vi.fn()
}))
import { createApp } from '../../src/index.js'
import { KerithError } from '@kerith/core'
import { Cron } from '@kerith/identifiers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Cron Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws INVALID_CRON_EXPRESSION on boot for invalid cron expression', async () => {
    Cron('invalid-cron', 'this is not a cron', () => {})

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-cron-'))
    
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
      await expect(createApp(app as any, { logger: () => {} })).rejects.toThrowError(
        expect.objectContaining({
          code: 'INVALID_CRON_EXPRESSION'
        })
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
