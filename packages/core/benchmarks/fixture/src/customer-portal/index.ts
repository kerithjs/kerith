import { Module } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { BillingService } from '@modules/billing';
import { AnalyticsService } from '@modules/analytics';
import { InventoryService } from '@modules/inventory';

Module('customer-portal', {
  imports: ["search","billing","analytics","inventory"],
  exports: ['CustomerPortalService']
});

export * from './customer-portal.service.js';
export * from './customer-portal.repository.js';
export * from './customer-portal.schema.js';