import { Module } from '../../../../src/index.js';
import { PaymentsService } from '@modules/payments';
import { ProductsService } from '@modules/products';
import { RecommendationsService } from '@modules/recommendations';
import { TaxService } from '@modules/tax';

Module('backoffice', {
  imports: ["payments","products","recommendations","tax"],
  exports: ['BackofficeService']
});

export * from './backoffice.service.js';
export * from './backoffice.repository.js';
export * from './backoffice.schema.js';