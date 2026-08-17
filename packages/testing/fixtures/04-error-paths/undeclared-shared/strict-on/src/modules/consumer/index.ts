import { Module } from '@kerith/core'

// '@no-es-shared-valido' is not '@shared' nor a subpath of '@shared'.
// With strict: true  → KerithError UNDECLARED_SHARED (throw)
// With strict: false → log.warn   UNDECLARED_SHARED (warn, boot continues)
export default Module('consumer', {
  shared: ['@no-es-shared-valido']
})
