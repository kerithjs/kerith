import { Service } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { RecommendationsService } from '@modules/recommendations';
import { OrdersService } from '@modules/orders';
import { BillingService } from '@modules/billing';

Service('OpsService');
export class OpsService {
  execute() { return true; }
}