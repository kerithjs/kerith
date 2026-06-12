import { Module } from '../../../../src/index.js';
import { InvoicesService } from '@modules/invoices';
import { PaymentsService } from '@modules/payments';
import { OrdersService } from '@modules/orders';
import { PromotionsService } from '@modules/promotions';

Module('dashboard', {
  imports: ["invoices","payments","orders","promotions"],
  exports: ['DashboardService']
});

export * from './dashboard.service.js';
export * from './dashboard.repository.js';
export * from './dashboard.schema.js';