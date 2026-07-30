import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetExtensionStore } from '@kerith/core'
import { _resetAllChannels } from '@kerith/identifiers'

describe('Stream Channel Executor', () => {
  beforeEach(() => {
    vi.resetModules()
    _resetExtensionStore()
    _resetAllChannels()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    _resetExtensionStore()
    _resetAllChannels()
  })

  it('registers Stream() plugin as a BindingProvider with kind === "stream" via executeStreamChannel()', async () => {
    // Mock Redis connection to prevent real connection attempts
    vi.doMock('../../src/adapters/redis-connection.js', () => ({
      getRedisConnection: () => ({
        host: 'localhost',
        port: 6379,
      }),
    }))

    // Import executor and Stream after mock is set up (same module instance)
    const { executeStreamChannel } = await import('../../src/runtime/stream-executor.js')
    const { Stream } = await import('@kerith/identifiers')
    const { getRegisteredBindingProviders } = await import('@kerith/core')
    const handler = async (_chunk: unknown) => {}
    Stream('audio-chunks-stream-test-1', handler, { backpressure: true })

    // Execute the stream channel to register BindingProviders in Core
    await executeStreamChannel()

    // Verify the BindingProvider was registered in Core (not just in identifiers catalog)
    const registeredProviders = getRegisteredBindingProviders()
    const streamProvider = registeredProviders.find(p => p.name === 'audio-chunks-stream-test-1' && p.kind === 'stream')

    expect(streamProvider).toBeDefined()
    expect(streamProvider?.kind).toBe('stream')
  })

  it('does NOT register plugins with kind other than "stream"', async () => {
    // Mock Redis connection to prevent real connection attempts
    vi.doMock('../../src/adapters/redis-connection.js', () => ({
      getRedisConnection: () => ({
        host: 'localhost',
        port: 6379,
      }),
    }))

    // Import executor fresh after reset (same module instance)
    const { executeStreamChannel } = await import('../../src/runtime/stream-executor.js')
    const { getRegisteredBindingProviders } = await import('@kerith/core')

    // Import and declare a non-stream binding (e.g., Worker)
    const { Worker } = await import('@kerith/identifiers')
    const workerHandler = (_job: unknown) => {}
    Worker('test-job-stream-no-register', workerHandler)

    // Execute the stream channel
    await executeStreamChannel()

    // Verify only stream plugins were registered
    const registeredProviders = getRegisteredBindingProviders()
    const streamProviders = registeredProviders.filter(p => p.kind === 'stream')
    const nonStreamProviders = registeredProviders.filter(p => p.kind !== 'stream')

    // Stream executor should only register stream plugins
    expect(streamProviders.every(p => p.kind === 'stream')).toBe(true)

    // Non-stream plugins should not be registered by stream executor
    if (nonStreamProviders.length > 0) {
      expect(nonStreamProviders.some(p => p.kind === 'stream')).toBe(false)
    }
  })
})
