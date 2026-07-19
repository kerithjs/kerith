// src/index.ts

import { registerIdentifierMetadata } from '@kerith/core/extension'
import { IDENTIFIER_CATALOG } from '@kerith/identifiers'

// Registers the full catalog metadata into core.
// registerIdentifierMetadata() deduplicates by `name` internally
// (throws DUPLICATE_EXTENSION_PROVIDER if called twice with the same name) —
// confirmed in Core's extension/index.ts. This loop is safe to run only once.
for (const meta of IDENTIFIER_CATALOG) {
  registerIdentifierMetadata(meta)
}

// Channel executors are imported here as they are implemented.
// See PHASE 4+ checklist and the corrected package document, section 7.
// import './runtime/middleware-channel-executor.js'
// import './runtime/cron-executor.js'
// import './runtime/schedule-passthrough-executor.js'
// import './runtime/worker-executor.js'
// import './runtime/message-executor.js'
// import './runtime/stream-executor.js'
// import './runtime/alias-channel-executor.js'  ← blocked, see Notes at the end

// Re-export the full public surface.
export * from '@kerith/core'
export * from '@kerith/identifiers'
// Disambiguate: IdentifierMetadata and IdentifierCategory exist in both packages.
// The explicit export takes precedence over export * and resolves TS2308.
export type { IdentifierCategory, IdentifierMetadata } from '@kerith/core'
