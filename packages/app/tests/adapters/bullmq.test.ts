import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getRedisConnection } from '../../src/adapters/redis-connection.js'
import { KerithError } from '@kerith/core'

describe('getRedisConnection', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear Redis-related env vars before each test
    delete process.env.KERITH_REDIS_HOST
    delete process.env.KERITH_REDIS_PORT
    delete process.env.KERITH_REDIS_PASSWORD
  })

  afterEach(() => {
    // Restore original env vars after each test
    process.env = { ...originalEnv }
  })

  it('returns default localhost:6379 when no env vars are set', () => {
    const connection = getRedisConnection()

    expect(connection).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    })
  })

  it('respects KERITH_REDIS_HOST when set', () => {
    process.env.KERITH_REDIS_HOST = 'redis.example.com'

    const connection = getRedisConnection()

    expect(connection.host).toBe('redis.example.com')
    expect(connection.port).toBe(6379)
    expect(connection.password).toBeUndefined()
  })

  it('respects KERITH_REDIS_PORT when set', () => {
    process.env.KERITH_REDIS_PORT = '6380'

    const connection = getRedisConnection()

    expect(connection.host).toBe('localhost')
    expect(connection.port).toBe(6380)
    expect(connection.password).toBeUndefined()
  })

  it('respects KERITH_REDIS_PASSWORD when set', () => {
    process.env.KERITH_REDIS_PASSWORD = 'secret123'

    const connection = getRedisConnection()

    expect(connection.host).toBe('localhost')
    expect(connection.port).toBe(6379)
    expect(connection.password).toBe('secret123')
  })

  it('respects all env vars when set together', () => {
    process.env.KERITH_REDIS_HOST = 'redis.example.com'
    process.env.KERITH_REDIS_PORT = '6380'
    process.env.KERITH_REDIS_PASSWORD = 'secret123'

    const connection = getRedisConnection()

    expect(connection).toEqual({
      host: 'redis.example.com',
      port: 6380,
      password: 'secret123',
    })
  })

  it('throws INVALID_ENV_CONFIG when KERITH_REDIS_PORT is not a number', () => {
    process.env.KERITH_REDIS_PORT = 'abc'

    expect(() => getRedisConnection()).toThrow(KerithError)

    try {
      getRedisConnection()
    } catch (err: any) {
      expect(err.code).toBe('INVALID_ENV_CONFIG')
      expect(err.message).toContain('KERITH_REDIS_PORT')
      expect(err.message).toContain('abc')
    }
  })

  it('throws INVALID_ENV_CONFIG when KERITH_REDIS_PORT is negative', () => {
    process.env.KERITH_REDIS_PORT = '-1'

    expect(() => getRedisConnection()).toThrow(KerithError)

    try {
      getRedisConnection()
    } catch (err: any) {
      expect(err.code).toBe('INVALID_ENV_CONFIG')
      expect(err.message).toContain('KERITH_REDIS_PORT')
      expect(err.message).toContain('-1')
    }
  })

  it('throws INVALID_ENV_CONFIG when KERITH_REDIS_PORT is zero', () => {
    process.env.KERITH_REDIS_PORT = '0'

    expect(() => getRedisConnection()).toThrow(KerithError)

    try {
      getRedisConnection()
    } catch (err: any) {
      expect(err.code).toBe('INVALID_ENV_CONFIG')
      expect(err.message).toContain('KERITH_REDIS_PORT')
      expect(err.message).toContain('0')
    }
  })
})
