import { Service } from '../../../../src/index.js';
import { InvoicesService } from '@modules/invoices';
import { PaymentsService } from '@modules/payments';
import { OrdersService } from '@modules/orders';
import { PromotionsService } from '@modules/promotions';

Service('DashboardService');
export class DashboardService {
  execute() { return true; }
}