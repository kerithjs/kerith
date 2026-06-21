import { Module } from '../../../../src/index.js';
import { ReportsService } from '@modules/reports';
import { InvoicesService } from '@modules/invoices';
import { PaymentsService } from '@modules/payments';
import { AnalyticsService } from '@modules/analytics';

Module('checkout', {
  imports: ["reports","invoices","payments","analytics"],
  exports: ['CheckoutService']
});

export * from './checkout.service.js';
export * from './checkout.repository.js';
export * from './checkout.schema.js';