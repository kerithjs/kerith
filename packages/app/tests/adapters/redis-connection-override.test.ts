// tests/adapters/redis-connection-override.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getRedisConnection } from '../../src/adapters/redis-connection.js'
import { KerithError } from '@kerith/core'

describe('getRedisConnection — override parameter', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.KERITH_REDIS_HOST
    delete process.env.KERITH_REDIS_PORT
    delete process.env.KERITH_REDIS_PASSWORD
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // ── §4.4 Test 1: override takes priority over env vars / defaults ────────────

  it('uses override host and port instead of defaults', () => {
    const conn = getRedisConnection({ host: 'test-host', port: 1234 })
    expect(conn).toEqual({ host: 'test-host', port: 1234, password: undefined })
  })

  it('uses override password instead of env var', () => {
    process.env.KERITH_REDIS_PASSWORD = 'env-secret'
    const conn = getRedisConnection({ host: 'test-host', port: 1234, password: 'override-secret' })
    expect(conn.password).toBe('override-secret')
  })

  it('uses override host while falling back env port to number', () => {
    process.env.KERITH_REDIS_PORT = '9999'
    const conn = getRedisConnection({ host: 'test-host' })
    expect(conn.host).toBe('test-host')
    expect(conn.port).toBe(9999) // still reads from env when override.port is absent
  })

  it('override port takes priority over KERITH_REDIS_PORT env var', () => {
    process.env.KERITH_REDIS_HOST = 'env-host'
    process.env.KERITH_REDIS_PORT = '9999'
    const conn = getRedisConnection({ port: 1234 })
    expect(conn.host).toBe('env-host') // host falls through to env
    expect(conn.port).toBe(1234)       // port is taken from override
  })

  // ── §4.4 Test 2: no override → behavior identical to current (no regression) ─

  it('returns localhost:6379 with no override and no env vars (no regression)', () => {
    const conn = getRedisConnection()
    expect(conn).toEqual({ host: 'localhost', port: 6379, password: undefined })
  })

  it('respects env vars when no override is passed (no regression)', () => {
    process.env.KERITH_REDIS_HOST = 'redis.example.com'
    process.env.KERITH_REDIS_PORT = '6380'
    process.env.KERITH_REDIS_PASSWORD = 'env-secret'
    const conn = getRedisConnection()
    expect(conn).toEqual({ host: 'redis.example.com', port: 6380, password: 'env-secret' })
  })

  // ── §4.4 Test 3: mock injection without env vars ────────────────────────────

  it('can inject a test Redis host/port without any env vars (isolation use-case)', () => {
    // Env vars are cleared in beforeEach — this simulates a clean test environment
    // where each test provides its own connection coordinates via override.
    const conn = getRedisConnection({ host: 'test-redis', port: 6399 })
    expect(conn.host).toBe('test-redis')
    expect(conn.port).toBe(6399)
    expect(conn.password).toBeUndefined()
  })

  it('two isolated connections do not bleed into each other via env vars', () => {
    const connA = getRedisConnection({ host: 'redis-a', port: 6001 })
    const connB = getRedisConnection({ host: 'redis-b', port: 6002 })
    expect(connA.host).toBe('redis-a')
    expect(connA.port).toBe(6001)
    expect(connB.host).toBe('redis-b')
    expect(connB.port).toBe(6002)
  })

  // ── §4.4 Test 4: negative — invalid override port still throws INVALID_ENV_CONFIG

  it('throws INVALID_ENV_CONFIG when override port is -1', () => {
    expect(() => getRedisConnection({ port: -1 })).toThrow(KerithError)
    try {
      getRedisConnection({ port: -1 })
    } catch (err: any) {
      expect(err.code).toBe('INVALID_ENV_CONFIG')
      expect(err.message).toContain('-1')
    }
  })

  it('throws INVALID_ENV_CONFIG when override port is 0', () => {
    expect(() => getRedisConnection({ port: 0 })).toThrow(KerithError)
    try {
      getRedisConnection({ port: 0 })
    } catch (err: any) {
      expect(err.code).toBe('INVALID_ENV_CONFIG')
      expect(err.message).toContain('0')
    }
  })

  it('throws INVALID_ENV_CONFIG when override port is NaN', () => {
    expect(() => getRedisConnection({ port: NaN })).toThrow(KerithError)
    try {
      getRedisConnection({ port: NaN })
    } catch (err: any) {
      expect(err.code).toBe('INVALID_ENV_CONFIG')
    }
  })
})
