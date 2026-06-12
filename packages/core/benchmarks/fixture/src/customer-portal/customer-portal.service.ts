import { Service } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { BillingService } from '@modules/billing';
import { AnalyticsService } from '@modules/analytics';
import { InventoryService } from '@modules/inventory';

Service('CustomerPortalService');
export class CustomerPortalService {
  execute() { return true; }
}