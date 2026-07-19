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

// Individual identifiers are exported here as they are implemented.
// See PHASE 5+ checklist.
