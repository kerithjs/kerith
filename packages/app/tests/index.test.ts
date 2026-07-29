// tests/index.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'

describe('@kerith/app entry point', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the full catalog without throwing', async () => {
    await import('../src/index.js')
    const { getRegisteredIdentifierMetadata } = await import('@kerith/core/extension')
    expect(getRegisteredIdentifierMetadata().length).toBeGreaterThan(0)
  })

  it('does not call loadSocketIOTransport() when no Gateway() is declared', async () => {
    // Mock loadSocketIOTransport to spy on it
    vi.doMock('../src/adapters/socket-io.js', () => ({
      loadSocketIOTransport: vi.fn(),
    }))

    const { createApp } = await import('../src/index.js')
    const { loadSocketIOTransport } = await import('../src/adapters/socket-io.js')

    const app = express()
    const kerithApp = await createApp(app as any)

    const mockServer = {} as any
    await kerithApp.listen(mockServer)

    // loadSocketIOTransport should not have been called
    expect(loadSocketIOTransport).not.toHaveBeenCalled()

    vi.doUnmock('../src/adapters/socket-io.js')
  })
})
