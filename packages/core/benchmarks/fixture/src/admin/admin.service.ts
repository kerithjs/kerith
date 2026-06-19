import { Service } from '../../../../src/index.js';
import { BillingService } from '@modules/billing';
import { InvoicesService } from '@modules/invoices';
import { AnalyticsService } from '@modules/analytics';
import { AddressService } from '@modules/address';

Service('AdminService');
export class AdminService {
  execute() { return true; }
}