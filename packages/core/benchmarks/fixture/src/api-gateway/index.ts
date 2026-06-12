import { Module } from '../../../../src/index.js';
import { BillingService } from '@modules/billing';
import { PromotionsService } from '@modules/promotions';
import { RecommendationsService } from '@modules/recommendations';
import { SubscriptionsService } from '@modules/subscriptions';

Module('api-gateway', {
  imports: ["billing","promotions","recommendations","subscriptions"],
  exports: ['ApiGatewayService']
});

export * from './api-gateway.service.js';
export * from './api-gateway.repository.js';
export * from './api-gateway.schema.js';