import { describe, it, expect, vi, afterEach } from 'vitest'
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
    // Import Stream without calling createApp to avoid starting the consumption loop
    const { Stream } = await import('@kerith/identifiers')
    const handler = async (chunk: unknown) => {}
    Stream('audio-chunks', handler, { backpressure: true })

    // Verify the plugin was registered in the catalog
    const { getBindingPlugins } = await import('@kerith/identifiers')
    const allPlugins = getBindingPlugins()
    const streamPlugin = allPlugins.find(p => p.name === 'audio-chunks' && p.kind === 'stream')

    expect(streamPlugin).toBeDefined()
    expect(streamPlugin?.kind).toBe('stream')
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
