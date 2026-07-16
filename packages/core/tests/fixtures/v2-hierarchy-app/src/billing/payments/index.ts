import { Module } from '@kerith/core'

Module('payments', {
  imports: ['invoices'],
  exports: ['PaymentService'],
})
