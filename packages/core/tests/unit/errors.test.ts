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
