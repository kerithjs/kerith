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
