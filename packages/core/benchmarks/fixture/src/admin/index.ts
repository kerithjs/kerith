import { Module } from '../../../../src/index.js';
import { BillingService } from '@modules/billing';
import { InvoicesService } from '@modules/invoices';
import { AnalyticsService } from '@modules/analytics';
import { AddressService } from '@modules/address';

Module('admin', {
  imports: ["billing","invoices","analytics","address"],
  exports: ['AdminService']
});

export * from './admin.service.js';
export * from './admin.repository.js';
export * from './admin.schema.js';