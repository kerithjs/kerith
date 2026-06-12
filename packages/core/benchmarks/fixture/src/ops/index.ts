import { Module } from '../../../../src/index.js';
import { OrdersService } from '@modules/orders';
import { PaymentsService } from '@modules/payments';
import { NotificationsService } from '@modules/notifications';
import { ProductsService } from '@modules/products';

Module('ops', {
  imports: ["orders","payments","notifications","products"],
  exports: ['OpsService']
});

export * from './ops.service.js';
export * from './ops.repository.js';
export * from './ops.schema.js';