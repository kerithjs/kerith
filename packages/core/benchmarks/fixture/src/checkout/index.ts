import { Module } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { InvoicesService } from '@modules/invoices';
import { AddressService } from '@modules/address';
import { BillingService } from '@modules/billing';

Module('checkout', {
  imports: ["cart","invoices","address","billing"],
  exports: ['CheckoutService']
});

export * from './checkout.service.js';
export * from './checkout.repository.js';
export * from './checkout.schema.js';