import { describe, it, expect } from 'vitest'
import { KerithError } from '../../src/core/errors.js'

describe('KerithError', () => {
  it('stores the error code', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message')
    expect(err.code).toBe('DUPLICATE_MODULE')
  })

  it('is an instance of KerithError', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message')
    expect(err instanceof KerithError).toBe(true)
  })

  it('is an instance of Error', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message')
    expect(err instanceof Error).toBe(true)
  })

  it('stores the message', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message')
    expect(err.message).toBe('some message')
  })

  it('stores optional details', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message', 'extra detail')
    expect(err.details).toBe('extra detail')
  })

  it('has no details when not provided', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message')
    expect(err.details).toBeUndefined()
  })

  it('has name set to KerithError', () => {
    const err = new KerithError('DUPLICATE_MODULE', 'some message')
    expect(err.name).toBe('KerithError')
  })
})

// ─── Part 3 — Extension API + identifier codes ────────────────────────────────
describe('KerithErrorCode — Part 3 (Extension API)', () => {
  it('accepts INVALID_IDENTIFIER_NAME', () => {
    const err = new KerithError('INVALID_IDENTIFIER_NAME', 'name must be a non-empty string')
    expect(err.code).toBe('INVALID_IDENTIFIER_NAME')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts DUPLICATE_ALIAS_IDENTIFIER', () => {
    const err = new KerithError('DUPLICATE_ALIAS_IDENTIFIER', 'duplicate Client "db"')
    expect(err.code).toBe('DUPLICATE_ALIAS_IDENTIFIER')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts DUPLICATE_MIDDLEWARE_IDENTIFIER', () => {
    const err = new KerithError('DUPLICATE_MIDDLEWARE_IDENTIFIER', 'duplicate Guard "Auth"')
    expect(err.code).toBe('DUPLICATE_MIDDLEWARE_IDENTIFIER')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts DUPLICATE_SCHEDULE_IDENTIFIER', () => {
    const err = new KerithError('DUPLICATE_SCHEDULE_IDENTIFIER', 'duplicate Cron "CleanUp"')
    expect(err.code).toBe('DUPLICATE_SCHEDULE_IDENTIFIER')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts DUPLICATE_BINDING_IDENTIFIER', () => {
    const err = new KerithError('DUPLICATE_BINDING_IDENTIFIER', 'duplicate Worker "EmailWorker"')
    expect(err.code).toBe('DUPLICATE_BINDING_IDENTIFIER')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts DUPLICATE_EXTENSION_PROVIDER', () => {
    const err = new KerithError('DUPLICATE_EXTENSION_PROVIDER', 'duplicate ScheduleProvider "cron-scheduler"')
    expect(err.code).toBe('DUPLICATE_EXTENSION_PROVIDER')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts MISSING_PEER_DEPENDENCY', () => {
    const err = new KerithError(
      'MISSING_PEER_DEPENDENCY',
      'bullmq is not installed',
      'Run: npm install bullmq',
    )
    expect(err.code).toBe('MISSING_PEER_DEPENDENCY')
    expect(err.details).toBe('Run: npm install bullmq')
  })

  it('accepts INVALID_CRON_EXPRESSION', () => {
    const err = new KerithError(
      'INVALID_CRON_EXPRESSION',
      '"* * * 13 *" is not a valid cron expression',
      'Month field must be 1-12.',
    )
    expect(err.code).toBe('INVALID_CRON_EXPRESSION')
    expect(err.details).toBe('Month field must be 1-12.')
  })
})

// ─── Alias lifecycle codes (6.1 / 6.2) ───────────────────────────────────────
describe('KerithErrorCode — Alias lifecycle (6.1 / 6.2)', () => {
  it('accepts ALIAS_FACTORY_FAILED and stores cause', () => {
    const cause = new Error('connection refused')
    const err = new KerithError('ALIAS_FACTORY_FAILED', 'factory failed', 'File: /db.ts', { cause })
    expect(err.code).toBe('ALIAS_FACTORY_FAILED')
    expect(err.cause).toBe(cause)
    expect(err.details).toBe('File: /db.ts')
  })

  it('accepts ALIAS_FACTORY_TIMEOUT', () => {
    const err = new KerithError('ALIAS_FACTORY_TIMEOUT', 'timed out after 30000ms')
    expect(err.code).toBe('ALIAS_FACTORY_TIMEOUT')
    expect(err instanceof KerithError).toBe(true)
  })

  it('accepts ALIAS_CIRCULAR', () => {
    const err = new KerithError('ALIAS_CIRCULAR', 'cycle detected')
    expect(err.code).toBe('ALIAS_CIRCULAR')
    expect(err instanceof KerithError).toBe(true)
  })

  it('KerithError without cause has no .cause property set', () => {
    const err = new KerithError('ALIAS_INVALID', 'bad timeout')
    expect((err as any).cause).toBeUndefined()
  })
})
