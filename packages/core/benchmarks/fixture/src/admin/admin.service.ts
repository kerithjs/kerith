import { Service } from '../../../../src/index.js';
import { InvoicesService } from '@modules/invoices';
import { ReportsService } from '@modules/reports';
import { PromotionsService } from '@modules/promotions';
import { ReviewsService } from '@modules/reviews';

Service('AdminService');
export class AdminService {
  execute() { return true; }
}