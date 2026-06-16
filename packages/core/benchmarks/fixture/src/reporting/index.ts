import { Module } from '../../../../src/index.js';
import { InventoryService } from '@modules/inventory';
import { SearchService } from '@modules/search';
import { WishlistService } from '@modules/wishlist';
import { AnalyticsService } from '@modules/analytics';

Module('reporting', {
  imports: ["inventory","search","wishlist","analytics"],
  exports: ['ReportingService']
});

export * from './reporting.service.js';
export * from './reporting.repository.js';
export * from './reporting.schema.js';