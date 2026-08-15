import { Config } from '@kerith/app'

/**
 * App configuration — the root of the composition chain.
 * Resolvable anywhere as: import appConfig from '@config/app'
 */
export const APP_CONFIG = {
  apiBase: 'https://api.example.com',
  timeout: 5000,
}

Config('app', () => APP_CONFIG)
