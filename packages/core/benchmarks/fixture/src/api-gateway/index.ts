import { Module } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { BillingService } from '@modules/billing';
import { RefundsService } from '@modules/refunds';
import { InventoryService } from '@modules/inventory';

Module('api-gateway', {
  imports: ["subscriptions","billing","refunds","inventory"],
  exports: ['ApiGatewayService']
});

export * from './api-gateway.service.js';
export * from './api-gateway.repository.js';
export * from './api-gateway.schema.js';