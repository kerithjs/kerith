import { Module } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { WishlistService } from '@modules/wishlist';
import { NotificationsService } from '@modules/notifications';
import { InvoicesService } from '@modules/invoices';

Module('reporting', {
  imports: ["promotions","wishlist","notifications","invoices"],
  exports: ['ReportingService']
});

export * from './reporting.service.js';
export * from './reporting.repository.js';
export * from './reporting.schema.js';