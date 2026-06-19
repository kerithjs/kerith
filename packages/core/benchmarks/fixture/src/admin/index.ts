import { Module } from '../../../../src/index.js';
import { WishlistService } from '@modules/wishlist';
import { InvoicesService } from '@modules/invoices';
import { ReviewsService } from '@modules/reviews';
import { AddressService } from '@modules/address';

Module('admin', {
  imports: ["wishlist","invoices","reviews","address"],
  exports: ['AdminService']
});

export * from './admin.service.js';
export * from './admin.repository.js';
export * from './admin.schema.js';