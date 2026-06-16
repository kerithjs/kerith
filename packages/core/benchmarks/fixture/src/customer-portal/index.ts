import { Module } from '../../../../src/index.js';
import { AnalyticsService } from '@modules/analytics';
import { PromotionsService } from '@modules/promotions';
import { TaxService } from '@modules/tax';
import { AddressService } from '@modules/address';

Module('customer-portal', {
  imports: ["analytics","promotions","tax","address"],
  exports: ['CustomerPortalService']
});

export * from './customer-portal.service.js';
export * from './customer-portal.repository.js';
export * from './customer-portal.schema.js';