import { Module } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { AddressService } from '@modules/address';
import { ProductsService } from '@modules/products';
import { CartService } from '@modules/cart';

Module('checkout', {
  imports: ["subscriptions","address","products","cart"],
  exports: ['CheckoutService']
});

export * from './checkout.service.js';
export * from './checkout.repository.js';
export * from './checkout.schema.js';