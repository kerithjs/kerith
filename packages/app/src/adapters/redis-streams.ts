// src/adapters/redis-streams.ts
import { KerithError } from '@kerith/core'
import { getRedisConnection } from './redis-connection.js'

export async function loadIORedis(): Promise<any> {
  try {
    return await import('ioredis')
  } catch {
    throw new KerithError(
      'MISSING_PEER_DEPENDENCY',
      `This identifier requires 'ioredis' to be installed.\nRun: pnpm add ioredis`,
    )
  }
}

export async function createRedisClient() {
  const { default: IORedis } = await loadIORedis()
  return new IORedis(getRedisConnection())
}
