import { Client } from '@kerith/app'
import { APP_CONFIG } from './app.config.js'

/**
 * HTTP client — built from APP_CONFIG (shared constant from Config registration).
 * Resolvable anywhere as: import httpClient from '@client/http'
 *
 * The `client` string encodes the resolved base URL so the test can assert
 * that the config value actually flowed through to the client.
 */
export const HTTP_CLIENT = {
  client: `http@${new URL(APP_CONFIG.apiBase).hostname}`,
  fetch: (path: string) => `${APP_CONFIG.apiBase}${path}`,
}

Client('http', () => HTTP_CLIENT)
