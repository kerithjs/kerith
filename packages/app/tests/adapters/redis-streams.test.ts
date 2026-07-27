import { describe, it, expect, vi } from 'vitest'
import { loadIORedis } from '../../src/adapters/redis-streams.js'
import { KerithError } from '@kerith/core'

describe('loadIORedis', () => {
  it('throws MISSING_PEER_DEPENDENCY when ioredis is not installed', async () => {
    vi.doMock('ioredis', () => {
      throw new Error('Cannot find module')
    })

    await expect(loadIORedis()).rejects.toThrow(KerithError)

    try {
      await loadIORedis()
    } catch (err: any) {
      expect(err.code).toBe('MISSING_PEER_DEPENDENCY')
      expect(err.message).toContain('ioredis')
      expect(err.message).toContain('pnpm add ioredis')
    }

    vi.doUnmock('ioredis')
  })
})
