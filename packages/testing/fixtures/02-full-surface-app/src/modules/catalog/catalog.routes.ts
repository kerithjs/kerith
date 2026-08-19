import { Controller } from '@kerith/app'
import { Router } from 'express'
import { APP_CONFIG } from '@config/app'
import { HTTP_CLIENT } from '@client/http'
import { CACHE_STORE } from '@store/cache'
import { DATA_PROVIDER } from '@provider/data'

Controller('/catalog')

const router = Router()

/**
 * GET /catalog/status
 *
 * Exposes the **derived** state from the full composition chain:
 *   Config('app') → Client('http') → Store('cache') → Provider('data')
 *
 * The response body is asserted byte-for-byte in the test via manifest.json,
 * so if any alias fails to resolve or produces wrong values the test fails.
 */
router.get('/status', (_req, res) => {
  res.json({
    apiBase: APP_CONFIG.apiBase,
    timeout: APP_CONFIG.timeout,
    client: HTTP_CLIENT.client,
    cache: CACHE_STORE.cache,
    provider: DATA_PROVIDER.provider,
  })
})

export default router
