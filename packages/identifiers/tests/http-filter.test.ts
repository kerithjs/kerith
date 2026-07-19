// tests/http-filter.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getMiddlewarePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Filter } = await import('../src/http/filter.js')

// ─── Error types used across tests ────────────────────────────────────────────
class NotFoundError extends Error {
  constructor(msg = 'Not found') { super(msg); this.name = 'NotFoundError'; }
}
class ValidationError extends Error {
  constructor(msg = 'Invalid input') { super(msg); this.name = 'ValidationError'; }
}
class UnrelatedError extends Error {
  constructor() { super('Something else'); }
}

beforeEach(() => {
  _resetAllChannels()
})

// ─── Registration ─────────────────────────────────────────────────────────────
describe('Filter() — registration', () => {
  it('registers exactly one MiddlewarePlugin', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    expect(getMiddlewarePlugins()).toHaveLength(1)
  })

  it('plugin has phase "error" and priority 1', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.phase).toBe('error')
    expect(plugin.priority).toBe(1)
  })

  it('multiple Filter() registrations each produce their own plugin', () => {
    Filter('not-found',   NotFoundError,   (err) => ({ status: 404, error: err.message }))
    Filter('validation',  ValidationError, (err) => ({ status: 422, error: err.message }))
    expect(getMiddlewarePlugins()).toHaveLength(2)
  })
})

// ─── getHandlers — global (no per-controller filtering) ───────────────────────
describe('Filter() — getHandlers() is global (not per-controller)', () => {
  it('always returns 1 handler regardless of controller argument', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    const plugin = getMiddlewarePlugins()[0]

    expect(plugin.getHandlers({ name: 'any-controller' })).toHaveLength(1)
    expect(plugin.getHandlers(null)).toHaveLength(1)
    expect(plugin.getHandlers(undefined)).toHaveLength(1)
  })

  it('two Filter() instances each return 1 handler for any controller', () => {
    Filter('not-found',  NotFoundError,   (err) => ({ status: 404, error: err.message }))
    Filter('validation', ValidationError, (err) => ({ status: 422, error: err.message }))

    const [nfPlugin, valPlugin] = getMiddlewarePlugins()

    expect(nfPlugin.getHandlers(null)).toHaveLength(1)
    expect(valPlugin.getHandlers(null)).toHaveLength(1)
  })
})

// ─── Handler arity ────────────────────────────────────────────────────────────
describe('Filter() — handler arity (fn.length === 4 required by Express)', () => {
  it('NotFoundError filter returns a handler with exactly 4 parameters', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    const [handler] = getMiddlewarePlugins()[0].getHandlers(null) as Function[]
    expect(handler.length).toBe(4)
  })

  it('ValidationError filter returns a handler with exactly 4 parameters', () => {
    Filter('validation', ValidationError, (err) => ({ status: 422, error: err.message }))
    const [handler] = getMiddlewarePlugins()[0].getHandlers(null) as Function[]
    expect(handler.length).toBe(4)
  })
})

// ─── Handler behavior — error does NOT match errorType ────────────────────────
describe('Filter() — handler passes unmatched errors to next(err)', () => {
  it('calls next(err) and does NOT call res.status when error does not match', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    const [handler] = getMiddlewarePlugins()[0].getHandlers(null) as Function[]

    const unrelated = new UnrelatedError()
    const next      = vi.fn()
    const res       = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    handler(unrelated, {}, res, next)

    expect(next).toHaveBeenCalledWith(unrelated)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('passes ValidationError to next when filter is for NotFoundError', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    const [handler] = getMiddlewarePlugins()[0].getHandlers(null) as Function[]

    const valErr = new ValidationError()
    const next   = vi.fn()

    handler(valErr, {}, { status: vi.fn().mockReturnThis(), json: vi.fn() }, next)

    expect(next).toHaveBeenCalledWith(valErr)
  })
})

// ─── Handler behavior — error MATCHES errorType ───────────────────────────────
describe('Filter() — handler responds when error matches errorType', () => {
  it('calls res.status(result.status).json(result) and does NOT call next()', () => {
    Filter('not-found', NotFoundError, (err) => ({ status: 404, error: err.message }))
    const [handler] = getMiddlewarePlugins()[0].getHandlers(null) as Function[]

    const nfErr    = new NotFoundError('User not found')
    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))
    const next       = vi.fn()

    handler(nfErr, {}, { status: statusMock }, next)

    expect(statusMock).toHaveBeenCalledWith(404)
    expect(jsonMock).toHaveBeenCalledWith({ status: 404, error: 'User not found' })
    expect(next).not.toHaveBeenCalled()
  })

  it('uses the full result shape returned by the handler (including extra fields)', () => {
    Filter(
      'validation',
      ValidationError,
      (err) => ({ status: 422, error: err.message, field: 'email' }),
    )
    const [handler] = getMiddlewarePlugins()[0].getHandlers(null) as Function[]

    const valErr   = new ValidationError('Invalid email')
    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    handler(valErr, {}, { status: statusMock }, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(422)
    expect(jsonMock).toHaveBeenCalledWith({ status: 422, error: 'Invalid email', field: 'email' })
  })

  it('each Filter() handles only its own errorType — two filters, one error each', () => {
    Filter('not-found',  NotFoundError,   (err) => ({ status: 404, error: err.message }))
    Filter('validation', ValidationError, (err) => ({ status: 422, error: err.message }))

    const [nfHandler, valHandler] = getMiddlewarePlugins().map(
      (p) => (p.getHandlers(null) as Function[])[0],
    )

    const nfJson   = vi.fn()
    const nfStatus = vi.fn(() => ({ json: nfJson }))
    const nfNext   = vi.fn()

    // NotFoundError → handled by first filter, passed to next by second
    nfHandler(new NotFoundError(), {}, { status: nfStatus }, nfNext)
    expect(nfStatus).toHaveBeenCalledWith(404)
    expect(nfNext).not.toHaveBeenCalled()

    const valJson   = vi.fn()
    const valStatus = vi.fn(() => ({ json: valJson }))
    const valNext   = vi.fn()

    valHandler(new NotFoundError(), {}, { status: valStatus }, valNext)
    expect(valNext).toHaveBeenCalledWith(expect.any(NotFoundError))
    expect(valStatus).not.toHaveBeenCalled()
  })
})
