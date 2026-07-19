// tests/security-guard.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getMiddlewarePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Guard } = await import('../src/security/guard.js')

// ─── Fake ControllerEntry shapes ──────────────────────────────────────────────
const controllerWithJwt       = { name: 'users',   metadata: { guards: ['jwt'] } }
const controllerWithOtherGuard = { name: 'products', metadata: { guards: ['other'] } }
const controllerWithNoGuards  = { name: 'public',  metadata: { guards: [] } }
const controllerWithoutField  = { name: 'legacy'  }  // guards field missing entirely

beforeEach(() => {
  _resetAllChannels()
})

// ─── Registration ─────────────────────────────────────────────────────────────
describe('Guard() — registration', () => {
  it('registers exactly one MiddlewarePlugin', () => {
    Guard('jwt', () => true)
    expect(getMiddlewarePlugins()).toHaveLength(1)
  })

  it('plugin has phase "pre" and priority 1', () => {
    Guard('jwt', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.phase).toBe('pre')
    expect(plugin.priority).toBe(1)
  })

  it('calling Guard() twice with same name registers two independent plugins (no dedup at this layer)', () => {
    Guard('jwt', () => true)
    Guard('jwt', () => false)
    expect(getMiddlewarePlugins()).toHaveLength(2)
  })
})

// ─── getHandlers — filtering by controller.guards ─────────────────────────────
describe('Guard() — getHandlers() filtering', () => {
  it('returns 1 handler when controller.guards includes the guard name', () => {
    Guard('jwt', () => true)
    const plugin = getMiddlewarePlugins()[0]
    const handlers = plugin.getHandlers(controllerWithJwt)
    expect(handlers).toHaveLength(1)
  })

  it('returns [] when controller.guards does NOT include the guard name', () => {
    Guard('jwt', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithOtherGuard)).toEqual([])
  })

  it('returns [] when controller.guards is empty', () => {
    Guard('jwt', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithNoGuards)).toEqual([])
  })

  it('returns [] when controller has no guards field (§0.3 not yet applied)', () => {
    Guard('jwt', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithoutField)).toEqual([])
  })

  it('returns [] for null/undefined controller (defensive)', () => {
    Guard('jwt', () => true)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(null)).toEqual([])
    expect(plugin.getHandlers(undefined)).toEqual([])
  })

  it('different guard names filter independently', () => {
    Guard('jwt', () => true)
    Guard('roles', () => true)

    const [jwtPlugin, rolesPlugin] = getMiddlewarePlugins()

    // controller declares both — both return a handler
    const bothController = { metadata: { guards: ['jwt', 'roles'] } }
    expect(jwtPlugin.getHandlers(bothController)).toHaveLength(1)
    expect(rolesPlugin.getHandlers(bothController)).toHaveLength(1)

    // controller only has jwt — roles plugin returns []
    expect(jwtPlugin.getHandlers(controllerWithJwt)).toHaveLength(1)
    expect(rolesPlugin.getHandlers(controllerWithJwt)).toEqual([])
  })
})

// ─── Handler behavior — check() passes ────────────────────────────────────────
describe('Guard() — handler allows request when check() returns true', () => {
  it('calls next() when check returns true (sync)', async () => {
    Guard('jwt', () => true)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const req  = {}
    const res  = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await handler(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('calls next() when check returns true (async)', async () => {
    Guard('jwt', async () => true)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const next = vi.fn()
    await handler({}, { status: vi.fn().mockReturnThis(), json: vi.fn() }, next)

    expect(next).toHaveBeenCalledOnce()
  })
})

// ─── Handler behavior — check() fails ─────────────────────────────────────────
describe('Guard() — handler rejects request when check() returns false', () => {
  it('responds with 401 and default message when check returns false', async () => {
    Guard('jwt', () => false)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))
    const res = { status: statusMock }

    await handler({}, res, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(401)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' })
  })

  it('responds with custom statusCode when options.statusCode is set', async () => {
    Guard('jwt', () => false, { statusCode: 403 })
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({}, { status: statusMock }, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(403)
  })

  it('responds with custom message when options.message is set', async () => {
    Guard('jwt', () => false, { message: 'Invalid token' })
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({}, { status: statusMock }, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid token' })
  })

  it('does NOT call next() when check returns false', async () => {
    Guard('jwt', () => false)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const next = vi.fn()
    const statusMock = vi.fn(() => ({ json: vi.fn() }))

    await handler({}, { status: statusMock }, next)

    expect(next).not.toHaveBeenCalled()
  })

  it('responds with 401 when async check rejects with false', async () => {
    Guard('jwt', async () => false)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithJwt) as Function[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({}, { status: statusMock }, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(401)
  })
})
