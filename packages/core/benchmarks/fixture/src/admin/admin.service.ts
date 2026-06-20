import { Service } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { ShippingService } from '@modules/shipping';
import { RefundsService } from '@modules/refunds';
import { NotificationsService } from '@modules/notifications';

Service('AdminService');
export class AdminService {
  execute() { return true; }
}