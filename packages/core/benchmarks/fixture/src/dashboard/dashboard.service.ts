import { Service } from '../../../../src/index.js';
import { NotificationsService } from '@modules/notifications';
import { WishlistService } from '@modules/wishlist';
import { InventoryService } from '@modules/inventory';
import { ProductsService } from '@modules/products';

Service('DashboardService');
export class DashboardService {
  execute() { return true; }
}