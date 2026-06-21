import { Module } from '../../../../src/index.js';
import { NotificationsService } from '@modules/notifications';
import { WishlistService } from '@modules/wishlist';
import { InventoryService } from '@modules/inventory';
import { ProductsService } from '@modules/products';

Module('dashboard', {
  imports: ["notifications","wishlist","inventory","products"],
  exports: ['DashboardService']
});

export * from './dashboard.service.js';
export * from './dashboard.repository.js';
export * from './dashboard.schema.js';