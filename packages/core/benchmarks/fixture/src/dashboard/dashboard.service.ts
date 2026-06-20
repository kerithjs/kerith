import { Service } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { OrdersService } from '@modules/orders';
import { ReviewsService } from '@modules/reviews';
import { AddressService } from '@modules/address';

Service('DashboardService');
export class DashboardService {
  execute() { return true; }
}