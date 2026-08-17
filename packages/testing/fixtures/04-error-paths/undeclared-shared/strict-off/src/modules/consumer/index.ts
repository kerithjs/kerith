import { Module } from '@kerith/core'

// '@no-es-shared-valido' is not '@shared' nor a subpath of '@shared'.
// With strict: false → log.warn UNDECLARED_SHARED, boot continues
export default Module('consumer', {
  shared: ['@no-es-shared-valido']
})
