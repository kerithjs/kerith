import { Module } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { OrdersService } from '@modules/orders';
import { ReviewsService } from '@modules/reviews';
import { AddressService } from '@modules/address';

Module('dashboard', {
  imports: ["cart","orders","reviews","address"],
  exports: ['DashboardService']
});

export * from './dashboard.service.js';
export * from './dashboard.repository.js';
export * from './dashboard.schema.js';