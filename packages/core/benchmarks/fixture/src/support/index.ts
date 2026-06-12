import { Module } from '../../../../src/index.js';
import { AnalyticsService } from '@modules/analytics';
import { ReviewsService } from '@modules/reviews';
import { ProductsService } from '@modules/products';
import { InvoicesService } from '@modules/invoices';

Module('support', {
  imports: ["analytics","reviews","products","invoices"],
  exports: ['SupportService']
});

export * from './support.service.js';
export * from './support.repository.js';
export * from './support.schema.js';