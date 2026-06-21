import { Module } from '../../../../src/index.js';
import { InventoryService } from '@modules/inventory';
import { AddressService } from '@modules/address';
import { SearchService } from '@modules/search';
import { NotificationsService } from '@modules/notifications';

Module('admin', {
  imports: ["inventory","address","search","notifications"],
  exports: ['AdminService']
});

export * from './admin.service.js';
export * from './admin.repository.js';
export * from './admin.schema.js';