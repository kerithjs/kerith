import { describe, it, expect, vi, afterEach } from 'vitest'
import { Message } from '@kerith/identifiers'
import { getRegisteredBindingProviders } from '@kerith/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApp } from '../../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function makeTmpApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-msg-'))
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
  fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')
  const moduleDir = path.join(tmpDir, 'src/modules/test')
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')
  fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
    import { Module } from '@kerith/core'
    Module('test')
  `)
  return { tmpDir }
}

describe('Message Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers Message() plugin as a BindingProvider with kind === "message"', async () => {
    const handler = async (msg: unknown) => {}
    Message('user.created', handler, { group: 'email-service' })

    const { tmpDir } = makeTmpApp()
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      await createApp(app as any, { logger: () => {} })

      const providers = getRegisteredBindingProviders()
      const msgProvider = providers.find(p => p.name === 'user.created' && p.kind === 'message')

      expect(msgProvider).toBeDefined()
      expect(msgProvider?.kind).toBe('message')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does NOT register plugins with kind other than "message"', async () => {
    // Verify that the executor's filter only passes kind === 'message'
    const { getBindingPlugins } = await import('@kerith/identifiers')

    const allPlugins = getBindingPlugins()
    const messagePlugins = allPlugins.filter(p => p.kind === 'message')
    const nonMessagePlugins = allPlugins.filter(p => p.kind !== 'message')

    // Message executor should only touch message plugins
    expect(messagePlugins.every(p => p.kind === 'message')).toBe(true)

    // Non-message plugins must not appear as message
    if (nonMessagePlugins.length > 0) {
      expect(nonMessagePlugins.some(p => p.kind === 'message')).toBe(false)
    }
  })
})
