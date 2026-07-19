// tests/security-rate-limit.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getMiddlewarePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { RateLimit } = await import('../src/security/rate-limit.js')

// ─── Fake ControllerEntry shapes ──────────────────────────────────────────────
const controllerWithApi    = { name: 'public',   rateLimit: 'api' }
const controllerWithStrict = { name: 'admin',    rateLimit: 'strict' }
const controllerNoLimit    = { name: 'internal'  }            // field missing
const controllerNullLimit  = { name: 'open', rateLimit: null } // null — not a match

beforeEach(() => {
  _resetAllChannels()
})

// ─── Registration ─────────────────────────────────────────────────────────────
describe('RateLimit() — registration', () => {
  it('registers exactly one MiddlewarePlugin', () => {
    RateLimit('api', () => true)
    expect(getMiddlewarePlugins()).toHaveLength(1)
  })

  it('plugin has phase "pre" and priority 2', () => {
    RateLimit('api', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.phase).toBe('pre')
    expect(plugin.priority).toBe(2)
  })

  it('priority 2 is strictly greater than Guard priority (1)', () => {
    RateLimit('api', () => true)
    expect(getMiddlewarePlugins()[0].priority).toBeGreaterThan(1)
  })
})

// ─── getHandlers — filtering by controller.rateLimit === name ─────────────────
describe('RateLimit() — getHandlers() filtering (string equality, not array)', () => {
  it('returns 1 handler when controller.rateLimit === name', () => {
    RateLimit('api', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithApi)).toHaveLength(1)
  })

  it('returns [] when controller.rateLimit is a different name', () => {
    RateLimit('api', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithStrict)).toEqual([])
  })

  it('returns [] when controller has no rateLimit field', () => {
    RateLimit('api', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerNoLimit)).toEqual([])
  })

  it('returns [] when controller.rateLimit is null', () => {
    RateLimit('api', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerNullLimit)).toEqual([])
  })

  it('returns [] for null/undefined controller', () => {
    RateLimit('api', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(null)).toEqual([])
    expect(plugin.getHandlers(undefined)).toEqual([])
  })

  it('two RateLimit() plugins with different names filter independently', () => {
    RateLimit('api', () => true)
    RateLimit('strict', () => false)

    const [apiPlugin, strictPlugin] = getMiddlewarePlugins()

    expect(apiPlugin.getHandlers(controllerWithApi)).toHaveLength(1)
    expect(apiPlugin.getHandlers(controllerWithStrict)).toEqual([])

    expect(strictPlugin.getHandlers(controllerWithStrict)).toHaveLength(1)
    expect(strictPlugin.getHandlers(controllerWithApi)).toEqual([])
  })
})

// ─── Handler behavior — request allowed ───────────────────────────────────────
describe('RateLimit() — handler allows request when check() returns true', () => {
  it('calls next() when check returns true (sync)', async () => {
    RateLimit('api', () => true)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithApi) as Function[]

    const next = vi.fn()
    const res  = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({}, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('calls next() when check returns true (async)', async () => {
    RateLimit('api', async () => true)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithApi) as Function[]

    const next = vi.fn()
    await handler({}, { status: vi.fn().mockReturnThis(), json: vi.fn() }, next)

    expect(next).toHaveBeenCalledOnce()
  })
})

// ─── Handler behavior — request rejected ──────────────────────────────────────
describe('RateLimit() — handler rejects request when check() returns false', () => {
  it('responds with 429 and default message', async () => {
    RateLimit('api', () => false)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithApi) as Function[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({}, { status: statusMock }, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(429)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Too Many Requests' })
  })

  it('uses custom message when options.message is set', async () => {
    RateLimit('api', () => false, { message: 'Límite excedido' })
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithApi) as Function[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({}, { status: statusMock }, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Límite excedido' })
  })

  it('does NOT call next() when check returns false', async () => {
    RateLimit('api', () => false)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithApi) as Function[]

    const next = vi.fn()
    const statusMock = vi.fn(() => ({ json: vi.fn() }))

    await handler({}, { status: statusMock }, next)

    expect(next).not.toHaveBeenCalled()
  })
})
