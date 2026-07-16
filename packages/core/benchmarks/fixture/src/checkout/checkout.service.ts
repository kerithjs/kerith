import { Service } from '../../../../src/index.js';
import { ReportsService } from '@modules/reports';
import { InvoicesService } from '@modules/invoices';
import { PaymentsService } from '@modules/payments';
import { AnalyticsService } from '@modules/analytics';

Service('CheckoutService');
export class CheckoutService {
  execute() { return true; }
}