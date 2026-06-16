import { Module } from '../../../../src/index.js';
import { BillingService } from '@modules/billing';
import { InvoicesService } from '@modules/invoices';
import { NotificationsService } from '@modules/notifications';
import { InventoryService } from '@modules/inventory';

Module('backoffice', {
  imports: ["billing","invoices","notifications","inventory"],
  exports: ['BackofficeService']
});

export * from './backoffice.service.js';
export * from './backoffice.repository.js';
export * from './backoffice.schema.js';