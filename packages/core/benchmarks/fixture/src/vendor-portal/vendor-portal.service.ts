import { Service } from '../../../../src/index.js';
import { RefundsService } from '@modules/refunds';
import { ReportsService } from '@modules/reports';
import { SubscriptionsService } from '@modules/subscriptions';
import { CartService } from '@modules/cart';

Service('VendorPortalService');
export class VendorPortalService {
  execute() { return true; }
}