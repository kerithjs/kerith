import { Module } from '../../../../src/index.js';
import { RefundsService } from '@modules/refunds';
import { ReportsService } from '@modules/reports';
import { SubscriptionsService } from '@modules/subscriptions';
import { CartService } from '@modules/cart';

Module('vendor-portal', {
  imports: ["refunds","reports","subscriptions","cart"],
  exports: ['VendorPortalService']
});

export * from './vendor-portal.service.js';
export * from './vendor-portal.repository.js';
export * from './vendor-portal.schema.js';