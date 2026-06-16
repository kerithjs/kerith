import { Module } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { WishlistService } from '@modules/wishlist';
import { TaxService } from '@modules/tax';
import { ShippingService } from '@modules/shipping';

Module('integrations', {
  imports: ["cart","wishlist","tax","shipping"],
  exports: ['IntegrationsService']
});

export * from './integrations.service.js';
export * from './integrations.repository.js';
export * from './integrations.schema.js';