import { Module } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { InventoryService } from '@modules/inventory';
import { PromotionsService } from '@modules/promotions';
import { CartService } from '@modules/cart';

Module('onboarding', {
  imports: ["search","inventory","promotions","cart"],
  exports: ['OnboardingService']
});

export * from './onboarding.service.js';
export * from './onboarding.repository.js';
export * from './onboarding.schema.js';