import { Service } from '../../../../src/index.js';
import { InventoryService } from '@modules/inventory';
import { OrdersService } from '@modules/orders';
import { ProductsService } from '@modules/products';
import { NotificationsService } from '@modules/notifications';

Service('WebhooksService');
export class WebhooksService {
  execute() { return true; }
}