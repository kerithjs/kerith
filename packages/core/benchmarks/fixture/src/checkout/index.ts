import { Module } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { AddressService } from '@modules/address';
import { SearchService } from '@modules/search';
import { ReportsService } from '@modules/reports';

Module('checkout', {
  imports: ["cart","address","search","reports"],
  exports: ['CheckoutService']
});

export * from './checkout.service.js';
export * from './checkout.repository.js';
export * from './checkout.schema.js';