// src/index.ts

// ─── Channels — only getters, never registration functions ────────────────────
export {
  getAliasPlugins,
  getMiddlewarePlugins,
  getSchedulePlugins,
  getBindingPlugins,
} from './channels/index.js'

// ─── Catalog ──────────────────────────────────────────────────────────────────
export { IDENTIFIER_CATALOG } from './catalog/metadata.js'
export type { IdentifierMetadata, IdentifierCategory } from './catalog/metadata.js'

// ─── Infrastructure — Alias channel ───────────────────────────────────────────
export { Client } from './infrastructure/client.js'
export { Config } from './infrastructure/config.js'
export { Provider } from './infrastructure/provider.js'
export { Store } from './infrastructure/store.js'
export { Adapter } from './infrastructure/adapter.js'
export type { AliasIdentifierOptions } from './infrastructure/_alias-factory.js'
