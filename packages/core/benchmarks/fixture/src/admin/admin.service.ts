import { Service } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { OrdersService } from '@modules/orders';
import { SubscriptionsService } from '@modules/subscriptions';
import { CartService } from '@modules/cart';

Service('AdminService');
export class AdminService {
  execute() { return true; }
}