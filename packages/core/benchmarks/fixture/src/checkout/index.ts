import { Module } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { ReviewsService } from '@modules/reviews';
import { ProductsService } from '@modules/products';
import { BillingService } from '@modules/billing';

Module('checkout', {
  imports: ["promotions","reviews","products","billing"],
  exports: ['CheckoutService']
});

export * from './checkout.service.js';
export * from './checkout.repository.js';
export * from './checkout.schema.js';