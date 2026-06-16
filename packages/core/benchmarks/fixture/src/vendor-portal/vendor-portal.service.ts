import { Service } from '../../../../src/index.js';
import { InvoicesService } from '@modules/invoices';
import { AnalyticsService } from '@modules/analytics';
import { SearchService } from '@modules/search';
import { ReportsService } from '@modules/reports';

Service('VendorPortalService');
export class VendorPortalService {
  execute() { return true; }
}