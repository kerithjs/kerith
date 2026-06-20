import { Module } from '../../../../src/index.js';
import { OrdersService } from '@modules/orders';
import { RefundsService } from '@modules/refunds';
import { NotificationsService } from '@modules/notifications';
import { PromotionsService } from '@modules/promotions';

Module('dashboard', {
  imports: ["orders","refunds","notifications","promotions"],
  exports: ['DashboardService']
});

export * from './dashboard.service.js';
export * from './dashboard.repository.js';
export * from './dashboard.schema.js';