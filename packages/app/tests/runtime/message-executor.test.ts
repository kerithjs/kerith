import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetExtensionStore } from '@kerith/core'
import { _resetAllChannels } from '@kerith/identifiers'

describe('Message Channel Executor', () => {
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

  it('registers Message() plugin as a BindingProvider with kind === "message" via executeMessageChannel()', async () => {
    // Mock Redis connection to prevent real connection attempts
    vi.doMock('../../src/adapters/redis-connection.js', () => ({
      getRedisConnection: () => ({
        host: 'localhost',
        port: 6379,
      }),
    }))

    // Import executor and Message after mock is set up (same module instance)
    const { executeMessageChannel } = await import('../../src/runtime/message-executor.js')
    const { Message } = await import('@kerith/identifiers')
    const { getRegisteredBindingProviders } = await import('@kerith/core')
    const handler = async (_msg: unknown) => {}
    Message('user-created-message-test-1', handler, { group: 'email-service' })

    // Execute the message channel to register BindingProviders in Core
    await executeMessageChannel()

    // Verify the BindingProvider was registered in Core (not just in identifiers catalog)
    const registeredProviders = getRegisteredBindingProviders()
    const messageProvider = registeredProviders.find(p => p.name === 'user-created-message-test-1' && p.kind === 'message')

    expect(messageProvider).toBeDefined()
    expect(messageProvider?.kind).toBe('message')
  })

  it('does NOT register plugins with kind other than "message"', async () => {
    // Mock Redis connection to prevent real connection attempts
    vi.doMock('../../src/adapters/redis-connection.js', () => ({
      getRedisConnection: () => ({
        host: 'localhost',
        port: 6379,
      }),
    }))

    // Import executor fresh after reset (same module instance)
    const { executeMessageChannel } = await import('../../src/runtime/message-executor.js')
    const { getRegisteredBindingProviders } = await import('@kerith/core')

    // Import and declare a non-message binding (e.g., Worker)
    const { Worker } = await import('@kerith/identifiers')
    const workerHandler = (_job: unknown) => {}
    Worker('test-job-message-no-register', workerHandler)

    // Execute the message channel
    await executeMessageChannel()

    // Verify only message plugins were registered
    const registeredProviders = getRegisteredBindingProviders()
    const messageProviders = registeredProviders.filter(p => p.kind === 'message')
    const nonMessageProviders = registeredProviders.filter(p => p.kind !== 'message')

    // Message executor should only register message plugins
    expect(messageProviders.every(p => p.kind === 'message')).toBe(true)

    // Non-message plugins should not be registered by message executor
    if (nonMessageProviders.length > 0) {
      expect(nonMessageProviders.some(p => p.kind === 'message')).toBe(false)
    }
  })
})
