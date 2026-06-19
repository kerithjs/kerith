import { Module } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { ShippingService } from '@modules/shipping';
import { InvoicesService } from '@modules/invoices';
import { OrdersService } from '@modules/orders';

Module('dashboard', {
  imports: ["subscriptions","shipping","invoices","orders"],
  exports: ['DashboardService']
});

export * from './dashboard.service.js';
export * from './dashboard.repository.js';
export * from './dashboard.schema.js';