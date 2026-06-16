import { Module } from '../../../../src/index.js';
import { InventoryService } from '@modules/inventory';
import { OrdersService } from '@modules/orders';
import { ProductsService } from '@modules/products';
import { NotificationsService } from '@modules/notifications';

Module('webhooks', {
  imports: ["inventory","orders","products","notifications"],
  exports: ['WebhooksService']
});

export * from './webhooks.service.js';
export * from './webhooks.repository.js';
export * from './webhooks.schema.js';