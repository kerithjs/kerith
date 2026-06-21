import { Service } from '../../../../src/index.js';
import { InventoryService } from '@modules/inventory';
import { AddressService } from '@modules/address';
import { SearchService } from '@modules/search';
import { NotificationsService } from '@modules/notifications';

Service('AdminService');
export class AdminService {
  execute() { return true; }
}