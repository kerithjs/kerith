import { Module } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { RecommendationsService } from '@modules/recommendations';
import { SubscriptionsService } from '@modules/subscriptions';
import { ReviewsService } from '@modules/reviews';

Module('checkout', {
  imports: ["search","recommendations","subscriptions","reviews"],
  exports: ['CheckoutService']
});

export * from './checkout.service.js';
export * from './checkout.repository.js';
export * from './checkout.schema.js';