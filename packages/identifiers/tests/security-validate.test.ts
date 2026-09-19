// tests/security-validate.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getMiddlewarePlugins } from '../src/channels/index.js'
import type { ValidatableSchema } from '../src/security/validate.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Validate } = await import('../src/security/validate.js')

// ─── Fake ControllerEntry shapes ──────────────────────────────────────────────
const controllerWithUserSchema = { name: 'users',   metadata: { validate: 'createUser' } }
const controllerWithOtherSchema = { name: 'products', metadata: { validate: 'other' } }
const controllerWithoutField  = { name: 'legacy'  }  // validate field missing entirely

beforeEach(() => {
  _resetAllChannels()
})

const fakeSchema: ValidatableSchema = {
  parse: (data) => ({ ...(data as any), coerced: true }),
}

// ─── Registration ─────────────────────────────────────────────────────────────
describe('Validate() — registration', () => {
  it('registers exactly one MiddlewarePlugin', () => {
    Validate('createUser', fakeSchema)
    expect(getMiddlewarePlugins()).toHaveLength(1)
  })

  it('plugin has phase "pre" and priority 0.5', () => {
    Validate('createUser', fakeSchema)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.phase).toBe('pre')
    expect(plugin.priority).toBe(0.5)
  })

  it('calling Validate() twice with same name registers two independent plugins (no dedup at this layer)', () => {
    Validate('createUser', fakeSchema)
    Validate('createUser', fakeSchema)
    expect(getMiddlewarePlugins()).toHaveLength(2)
  })
})

// ─── getHandlers — filtering by controller.validate ───────────────────────────
describe('Validate() — getHandlers() filtering (exact match)', () => {
  it('returns 1 handler when controller.validate matches exactly', () => {
    Validate('createUser', fakeSchema)
    const plugin = getMiddlewarePlugins()[0]
    const handlers = plugin.getHandlers(controllerWithUserSchema)
    expect(handlers).toHaveLength(1)
  })

  it('returns [] when controller.validate is a different string', () => {
    Validate('createUser', fakeSchema)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithOtherSchema)).toEqual([])
  })

  it('returns [] when controller has no validate field', () => {
    Validate('createUser', fakeSchema)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(controllerWithoutField)).toEqual([])
  })

  it('returns [] for null/undefined controller (defensive)', () => {
    Validate('createUser', fakeSchema)
    const plugin = getMiddlewarePlugins()[0]
    expect(plugin.getHandlers(null)).toEqual([])
    expect(plugin.getHandlers(undefined)).toEqual([])
  })
})

// ─── Handler behavior — schema.parse() passes ─────────────────────────────────
describe('Validate() — handler allows request when parse() succeeds', () => {
  it('calls next() and re-injects parsed/coerced body', async () => {
    Validate('createUser', fakeSchema)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const req  = { body: { original: true } }
    const res  = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await handler(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
    // Verify reinjection
    expect(req.body).toEqual({ original: true, coerced: true })
  })
})

// ─── Handler behavior — schema.parse() fails ──────────────────────────────────
describe('Validate() — handler rejects request when parse() fails', () => {
  it('responds with 400 and default message when parse throws (sync)', async () => {
    const throwsSchema: ValidatableSchema = {
      parse: () => { throw new Error('Sync error') }
    }
    Validate('createUser', throwsSchema)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))
    const res = { status: statusMock }
    const next = vi.fn()

    await handler({ body: {} }, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: 'Sync error'
    })
  })

  it('responds with 400 and default message when parse rejects (async)', async () => {
    const rejectsSchema: ValidatableSchema = {
      parse: async () => Promise.reject(new Error('Async error'))
    }
    Validate('createUser', rejectsSchema)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))
    const res = { status: statusMock }
    const next = vi.fn()

    await handler({ body: {} }, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: 'Async error'
    })
  })

  it('responds with custom statusCode when options.statusCode is set', async () => {
    const throwsSchema: ValidatableSchema = {
      parse: () => { throw new Error('Sync error') }
    }
    Validate('createUser', throwsSchema, { statusCode: 422 })
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({ body: {} }, { status: statusMock }, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(422)
  })

  it('responds with custom message when options.message is set', async () => {
    const throwsSchema: ValidatableSchema = {
      parse: () => { throw new Error('Sync error') }
    }
    Validate('createUser', throwsSchema, { message: 'Invalid payload' })
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({ body: {} }, { status: statusMock }, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid payload' }))
  })

  it('details fallback: uses .issues (Zod/Valibot)', async () => {
    const zodLikeSchema: ValidatableSchema = {
      parse: () => {
        const err: any = new Error('Zod error')
        err.issues = [{ path: ['name'], message: 'Required' }]
        throw err
      }
    }
    Validate('createUser', zodLikeSchema)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({ body: {} }, { status: statusMock }, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: [{ path: ['name'], message: 'Required' }]
    })
  })

  it('details fallback: uses .errors (other libs)', async () => {
    const otherLibSchema: ValidatableSchema = {
      parse: () => {
        const err: any = new Error('Other lib error')
        err.errors = ['email is invalid']
        throw err
      }
    }
    Validate('createUser', otherLibSchema)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({ body: {} }, { status: statusMock }, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: ['email is invalid']
    })
  })

  it('details fallback: uses String(err) for thrown strings/objects without message', async () => {
    const weirdSchema: ValidatableSchema = {
      parse: () => { throw 'Just a string error' }
    }
    Validate('createUser', weirdSchema)
    const [handler] = getMiddlewarePlugins()[0].getHandlers(controllerWithUserSchema) as any[]

    const jsonMock   = vi.fn()
    const statusMock = vi.fn(() => ({ json: jsonMock }))

    await handler({ body: {} }, { status: statusMock }, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: 'Just a string error'
    })
  })
})
