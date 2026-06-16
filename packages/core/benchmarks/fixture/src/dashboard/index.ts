import { Module } from '../../../../src/index.js';
import { AnalyticsService } from '@modules/analytics';
import { AddressService } from '@modules/address';
import { WishlistService } from '@modules/wishlist';
import { CartService } from '@modules/cart';

Module('dashboard', {
  imports: ["analytics","address","wishlist","cart"],
  exports: ['DashboardService']
});

export * from './dashboard.service.js';
export * from './dashboard.repository.js';
export * from './dashboard.schema.js';