import { Config } from '@kerith/app'

export const FEATURE_FLAGS = {
  v2: 'enabled'
}

Config('feature-flags', () => FEATURE_FLAGS)
