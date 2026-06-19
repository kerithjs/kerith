import { Service } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { ShippingService } from '@modules/shipping';
import { InvoicesService } from '@modules/invoices';
import { OrdersService } from '@modules/orders';

Service('DashboardService');
export class DashboardService {
  execute() { return true; }
}