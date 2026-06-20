import { Service } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { ReviewsService } from '@modules/reviews';
import { ProductsService } from '@modules/products';
import { BillingService } from '@modules/billing';

Service('CheckoutService');
export class CheckoutService {
  execute() { return true; }
}