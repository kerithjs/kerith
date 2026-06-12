import { Module } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { OrdersService } from '@modules/orders';
import { SubscriptionsService } from '@modules/subscriptions';
import { CartService } from '@modules/cart';

Module('admin', {
  imports: ["promotions","orders","subscriptions","cart"],
  exports: ['AdminService']
});

export * from './admin.service.js';
export * from './admin.repository.js';
export * from './admin.schema.js';