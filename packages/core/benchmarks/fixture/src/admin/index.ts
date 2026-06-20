import { Module } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { ShippingService } from '@modules/shipping';
import { RefundsService } from '@modules/refunds';
import { NotificationsService } from '@modules/notifications';

Module('admin', {
  imports: ["search","shipping","refunds","notifications"],
  exports: ['AdminService']
});

export * from './admin.service.js';
export * from './admin.repository.js';
export * from './admin.schema.js';