import { Module } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { RecommendationsService } from '@modules/recommendations';
import { OrdersService } from '@modules/orders';
import { BillingService } from '@modules/billing';

Module('ops', {
  imports: ["cart","recommendations","orders","billing"],
  exports: ['OpsService']
});

export * from './ops.service.js';
export * from './ops.repository.js';
export * from './ops.schema.js';