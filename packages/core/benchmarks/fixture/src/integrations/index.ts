import { Module } from '../../../../src/index.js';
import { ShippingService } from '@modules/shipping';
import { ReviewsService } from '@modules/reviews';
import { BillingService } from '@modules/billing';
import { TaxService } from '@modules/tax';

Module('integrations', {
  imports: ["shipping","reviews","billing","tax"],
  exports: ['IntegrationsService']
});

export * from './integrations.service.js';
export * from './integrations.repository.js';
export * from './integrations.schema.js';