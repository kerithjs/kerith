import { Module } from '@kerith/core'

export default Module('module-a', {
  imports: ['module-b'],
  exports: []
})
