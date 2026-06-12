import { Service } from '../../../../src/index.js';
import { AnalyticsService } from '@modules/analytics';
import { ReviewsService } from '@modules/reviews';
import { ProductsService } from '@modules/products';
import { InvoicesService } from '@modules/invoices';

Service('SupportService');
export class SupportService {
  execute() { return true; }
}