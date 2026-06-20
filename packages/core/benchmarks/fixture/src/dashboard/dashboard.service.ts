import { Service } from '../../../../src/index.js';
import { OrdersService } from '@modules/orders';
import { RefundsService } from '@modules/refunds';
import { NotificationsService } from '@modules/notifications';
import { PromotionsService } from '@modules/promotions';

Service('DashboardService');
export class DashboardService {
  execute() { return true; }
}