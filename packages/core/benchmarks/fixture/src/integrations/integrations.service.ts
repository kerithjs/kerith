import { Service } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { WishlistService } from '@modules/wishlist';
import { TaxService } from '@modules/tax';
import { ShippingService } from '@modules/shipping';

Service('IntegrationsService');
export class IntegrationsService {
  execute() { return true; }
}