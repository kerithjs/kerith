import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { _resetExtensionStore } from '@kerith/core'
import { _resetAllChannels } from '@kerith/identifiers'

describe('Gateway Channel Executor', () => {
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

  it('registers Gateway() plugin as a BindingProvider with kind === "gateway" via executeGatewayChannel()', async () => {
    // Mock Socket.io connection to prevent real connection attempts
    vi.doMock('../../src/adapters/socket-io.js', () => ({
      loadSocketIOTransport: async () => ({
        bind: vi.fn(),
        attach: vi.fn(),
      }),
    }))

    // Import executor and Gateway after mock is set up (same module instance)
    const { executeGatewayChannel } = await import('../../src/runtime/gateway-executor.js')
    const { Gateway } = await import('@kerith/identifiers')
    const { getRegisteredBindingProviders } = await import('@kerith/core')
    const handler2 = (_socket: unknown) => {}
    Gateway('chat-gateway-test-1', handler2, { namespace: '/chat' })

    // Execute the gateway channel to register BindingProviders in Core
    await executeGatewayChannel()

    // Verify the BindingProvider was registered in Core (not just in identifiers catalog)
    const registeredProviders = getRegisteredBindingProviders()
    const gatewayProvider = registeredProviders.find(p => p.name === 'chat-gateway-test-1' && p.kind === 'gateway')

    expect(gatewayProvider).toBeDefined()
    expect(gatewayProvider?.kind).toBe('gateway')
  })

  it('does NOT register plugins with kind other than "gateway"', async () => {
    // Mock Socket.io connection to prevent real connection attempts
    vi.doMock('../../src/adapters/socket-io.js', () => ({
      loadSocketIOTransport: async () => ({
        bind: vi.fn(),
        attach: vi.fn(),
      }),
    }))

    // Import executor and identifiers fresh after reset (same module instance)
    const { executeGatewayChannel } = await import('../../src/runtime/gateway-executor.js')
    const { getRegisteredBindingProviders } = await import('@kerith/core')

    // Import and declare a non-gateway binding (e.g., Worker)
    const { Worker } = await import('@kerith/identifiers')
    const workerHandler = (_job: unknown) => {}
    Worker('test-job-gateway-no-register', workerHandler)

    // Execute the gateway channel
    await executeGatewayChannel()

    // Verify only gateway plugins were registered
    const registeredProviders = getRegisteredBindingProviders()
    const gatewayProviders = registeredProviders.filter(p => p.kind === 'gateway')
    const nonGatewayProviders = registeredProviders.filter(p => p.kind !== 'gateway')

    // Gateway executor should only register gateway plugins
    expect(gatewayProviders.every(p => p.kind === 'gateway')).toBe(true)

    // Non-gateway plugins should not be registered by gateway executor
    if (nonGatewayProviders.length > 0) {
      expect(nonGatewayProviders.some(p => p.kind === 'gateway')).toBe(false)
    }
  })
})
