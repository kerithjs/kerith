import { Store } from '@kerith/app'

/**
 * In-memory cache store.
 * Resolvable anywhere as: import cache from '@store/cache'
 */
export const CACHE_STORE = {
  cache: 'in-memory-v1',
  get: (key: string) => `cached:${key}`,
}

Store('cache', () => CACHE_STORE)
