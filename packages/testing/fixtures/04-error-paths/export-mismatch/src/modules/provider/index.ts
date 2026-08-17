import { Module } from '@kerith/core'

// NOTE: 'getValue' is declared in exports[] but this file never exports it.
// Kerith will detect the mismatch in step-06-imports and throw EXPORT_MISMATCH.
export default Module('provider', {
  exports: ['getValue']
})
