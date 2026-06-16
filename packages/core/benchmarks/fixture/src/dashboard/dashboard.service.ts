import { Service } from '../../../../src/index.js';
import { AnalyticsService } from '@modules/analytics';
import { AddressService } from '@modules/address';
import { WishlistService } from '@modules/wishlist';
import { CartService } from '@modules/cart';

Service('DashboardService');
export class DashboardService {
  execute() { return true; }
}