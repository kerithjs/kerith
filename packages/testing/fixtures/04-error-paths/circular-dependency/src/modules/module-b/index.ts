import { Module } from '@kerith/core'

export default Module('module-b', {
  imports: ['module-a'],
  exports: []
})
