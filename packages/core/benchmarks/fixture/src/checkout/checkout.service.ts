import { Service } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { AddressService } from '@modules/address';
import { ProductsService } from '@modules/products';
import { CartService } from '@modules/cart';

Service('CheckoutService');
export class CheckoutService {
  execute() { return true; }
}