// tests/http-middleware.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getMiddlewarePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Middleware } = await import('../src/http/middleware.js')

// ─── Fake ControllerEntry shapes ──────────────────────────────────────────────
const controllerWithLogger = { name: 'users',   middlewareNames: ['logger'] }
const controllerWithCors   = { name: 'public',  middlewareNames: ['cors'] }
const controllerWithBoth   = { name: 'api',     middlewareNames: ['logger', 'cors'] }
const controllerNoNames    = { name: 'internal' }           // field missing
const controllerEmptyNames = { name: 'bare',    middlewareNames: [] }

beforeEach(() => {
  _resetAllChannels()
})

// ─── Registration ─────────────────────────────────────────────────────────────
describe('Middleware() — registration', () => {
  it('registers exactly one MiddlewarePlugin', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    expect(getMiddlewarePlugins()).toHaveLength(1)
  })

  it('plugin has phase "pre" and priority 0', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.phase).toBe('pre')
    expect(plugin.priority).toBe(0)
  })

  it('priority 0 is less than Guard (1) and RateLimit (2)', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    expect(getMiddlewarePlugins()[0].priority).toBeLessThan(1)
  })
})

// ─── getHandlers — filtering by controller.middlewareNames ────────────────────
describe('Middleware() — getHandlers() filtering (controller.middlewareNames)', () => {
  it('returns 1 handler when controller.middlewareNames includes the name', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithLogger)).toHaveLength(1)
  })

  it('returns [] when controller.middlewareNames does NOT include the name', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithCors)).toEqual([])
  })

  it('returns [] when controller has no middlewareNames field', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerNoNames)).toEqual([])
  })

  it('returns [] when controller.middlewareNames is empty', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerEmptyNames)).toEqual([])
  })

  it('returns [] for null/undefined controller', () => {
    Middleware('logger', (_req, _res, next) => (next as Function)())
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(null)).toEqual([])
    expect(plugin.getHandlers(undefined)).toEqual([])
  })

  it('controller with both names returns handler for each Middleware() registration', () => {
    const loggerFn = vi.fn()
    const corsFn   = vi.fn()
    Middleware('logger', loggerFn)
    Middleware('cors', corsFn)

    const [loggerPlugin, corsPlugin] = getMiddlewarePlugins()

    expect(loggerPlugin.getHandlers(controllerWithBoth)).toHaveLength(1)
    expect(corsPlugin.getHandlers(controllerWithBoth)).toHaveLength(1)

    // Cross-check — each plugin returns only its own handler
    expect(loggerPlugin.getHandlers(controllerWithBoth)[0]).toBe(loggerFn)
    expect(corsPlugin.getHandlers(controllerWithBoth)[0]).toBe(corsFn)
  })
})

// ─── Handler reference transparency ──────────────────────────────────────────
describe('Middleware() — handler reference is exact (no wrapping)', () => {
  it('getHandlers()[0] is the same function reference passed to Middleware()', () => {
    const handlerFn = vi.fn()
    Middleware('logger', handlerFn)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithLogger)[0]).toBe(handlerFn)
  })
})
