import { Module } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { RefundsService } from '@modules/refunds';
import { WishlistService } from '@modules/wishlist';
import { AddressService } from '@modules/address';

Module('onboarding', {
  imports: ["subscriptions","refunds","wishlist","address"],
  exports: ['OnboardingService']
});

export * from './onboarding.service.js';
export * from './onboarding.repository.js';
export * from './onboarding.schema.js';