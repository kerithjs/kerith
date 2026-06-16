import { Service } from '../../../../src/index.js';
import { BillingService } from '@modules/billing';
import { InvoicesService } from '@modules/invoices';
import { NotificationsService } from '@modules/notifications';
import { InventoryService } from '@modules/inventory';

Service('BackofficeService');
export class BackofficeService {
  execute() { return true; }
}