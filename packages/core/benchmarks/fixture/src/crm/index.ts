import { Module } from '../../../../src/index.js';
import { PaymentsService } from '@modules/payments';
import { InventoryService } from '@modules/inventory';
import { SubscriptionsService } from '@modules/subscriptions';
import { ReviewsService } from '@modules/reviews';

Module('crm', {
  imports: ["payments","inventory","subscriptions","reviews"],
  exports: ['CrmService']
});

export * from './crm.service.js';
export * from './crm.repository.js';
export * from './crm.schema.js';