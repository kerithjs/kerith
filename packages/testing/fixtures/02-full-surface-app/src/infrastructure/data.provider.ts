import { Provider } from '@kerith/app'
import { HTTP_CLIENT } from './http.client.js'
import { CACHE_STORE } from './cache.store.js'

/**
 * Data provider — composed from HTTP_CLIENT AND CACHE_STORE.
 * Its identifier string encodes both dependencies so the test can verify
 * the full composition chain arrived at the HTTP response.
 * Resolvable anywhere as: import dataProvider from '@provider/data'
 */
export const DATA_PROVIDER = {
  provider: `data-provider:${HTTP_CLIENT.client}+${CACHE_STORE.cache}`,
  query: (resource: string) => CACHE_STORE.get(HTTP_CLIENT.fetch(resource)),
}

Provider('data', () => DATA_PROVIDER)
