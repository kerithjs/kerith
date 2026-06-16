import { Module } from '../../../../src/index.js';
import { RefundsService } from '@modules/refunds';
import { PaymentsService } from '@modules/payments';
import { AddressService } from '@modules/address';
import { InvoicesService } from '@modules/invoices';

Module('support', {
  imports: ["refunds","payments","address","invoices"],
  exports: ['SupportService']
});

export * from './support.service.js';
export * from './support.repository.js';
export * from './support.schema.js';