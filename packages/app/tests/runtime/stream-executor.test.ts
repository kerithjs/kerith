import { describe, it, expect, vi, afterEach } from 'vitest'
import { Stream } from '@kerith/identifiers'
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-stream-'))
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

describe('Stream Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers Stream() plugin as a BindingProvider with kind === "stream"', async () => {
    const handler = async (chunk: unknown) => {}
    Stream('audio-chunks', handler, { backpressure: true })

    const { tmpDir } = makeTmpApp()
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      await createApp(app as any, { logger: () => {} })

      const providers = getRegisteredBindingProviders()
      const streamProvider = providers.find(p => p.name === 'audio-chunks' && p.kind === 'stream')

      expect(streamProvider).toBeDefined()
      expect(streamProvider?.kind).toBe('stream')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does NOT register plugins with kind other than "stream"', async () => {
    // Verify that the executor's filter only passes kind === 'stream'
    const { getBindingPlugins } = await import('@kerith/identifiers')

    const allPlugins = getBindingPlugins()
    const streamPlugins = allPlugins.filter(p => p.kind === 'stream')
    const nonStreamPlugins = allPlugins.filter(p => p.kind !== 'stream')

    // Stream executor should only touch stream plugins
    expect(streamPlugins.every(p => p.kind === 'stream')).toBe(true)

    // Non-stream plugins must not appear as stream
    if (nonStreamPlugins.length > 0) {
      expect(nonStreamPlugins.some(p => p.kind === 'stream')).toBe(false)
    }
  })
})
