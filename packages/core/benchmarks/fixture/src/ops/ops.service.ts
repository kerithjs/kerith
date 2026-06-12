import { Service } from '../../../../src/index.js';
import { OrdersService } from '@modules/orders';
import { PaymentsService } from '@modules/payments';
import { NotificationsService } from '@modules/notifications';
import { ProductsService } from '@modules/products';

Service('OpsService');
export class OpsService {
  execute() { return true; }
}