import { Module } from '../../../../src/index.js';
import { OrdersService } from '@modules/orders';
import { WishlistService } from '@modules/wishlist';
import { ShippingService } from '@modules/shipping';
import { CartService } from '@modules/cart';

Module('crm', {
  imports: ["orders","wishlist","shipping","cart"],
  exports: ['CrmService']
});

export * from './crm.service.js';
export * from './crm.repository.js';
export * from './crm.schema.js';