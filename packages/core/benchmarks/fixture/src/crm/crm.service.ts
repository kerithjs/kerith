import { Service } from '../../../../src/index.js';
import { OrdersService } from '@modules/orders';
import { WishlistService } from '@modules/wishlist';
import { ShippingService } from '@modules/shipping';
import { CartService } from '@modules/cart';

Service('CrmService');
export class CrmService {
  execute() { return true; }
}