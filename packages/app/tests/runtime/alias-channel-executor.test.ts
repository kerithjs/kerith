import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp } from '../../src/index.js'
import { Client } from '@kerith/identifiers'
import { getRegisteredAliasProviders } from '@kerith/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Alias Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers Client() alias provider correctly during boot', async () => {
    // Create a temp file to simulate the factory origin
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-alias-'))

    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
    fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

    const moduleDir = path.join(tmpDir, 'src/modules/test')
    fs.mkdirSync(moduleDir, { recursive: true })

    fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')

    // Simulate a real module file that calls Client() — getFileCallerInfo() will
    // capture the file path from the real call stack
    const clientModuleFile = path.join(moduleDir, 'database.ts')
    fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
      import { Module } from '@kerith/core'
      Module('test')
    `)

    // Register a Client alias at test time. The factory returns a sentinel value
    // so we can verify it was stored correctly.
    const factory = () => ({ connection: 'mock-db-connection' })
    Client('database', factory)

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      await createApp(app as any, { logger: () => {} })

      // After createApp() the executor must have called registerAliasProvider()
      const providers = getRegisteredAliasProviders()
      const dbProvider = providers.find(p => p.prefix === 'client' && p.name === 'database')

      expect(dbProvider).toBeDefined()
      expect(dbProvider?.prefix).toBe('client')
      expect(dbProvider?.name).toBe('database')
      // The factory reference must be passed through unchanged
      expect(dbProvider?.resolve).toBe(factory)
      // Verify the factory still produces the expected value
      expect(dbProvider?.resolve()).toEqual({ connection: 'mock-db-connection' })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
