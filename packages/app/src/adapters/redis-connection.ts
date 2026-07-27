// src/adapters/redis-connection.ts
import { KerithError } from '@kerith/core'

export interface RedisConnectionOptions {
  host: string
  port: number
  password?: string
}

/**
 * Reads Redis connection settings from environment variables.
 * Falls back to localhost:6379 (dev default) if nothing is set.
 * KERITH_REDIS_PORT is validated — a malformed value fails loudly
 * instead of producing a silent NaN that BullMQ would swallow.
 *
 * Used by multiple adapters (BullMQ, Message, Stream) to share the same
 * Redis connection configuration without duplicating code.
 */
export function getRedisConnection(): RedisConnectionOptions {
  const host = process.env.KERITH_REDIS_HOST ?? 'localhost'
  const rawPort = process.env.KERITH_REDIS_PORT
  const port = rawPort ? Number(rawPort) : 6379

  if (Number.isNaN(port) || port <= 0) {
    throw new KerithError(
      'INVALID_ENV_CONFIG',
      `KERITH_REDIS_PORT must be a positive number, received "${rawPort}".`,
    )
  }

  return {
    host,
    port,
    password: process.env.KERITH_REDIS_PASSWORD,
  }
}
