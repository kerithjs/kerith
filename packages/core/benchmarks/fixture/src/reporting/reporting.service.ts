import { Service } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { WishlistService } from '@modules/wishlist';
import { NotificationsService } from '@modules/notifications';
import { InvoicesService } from '@modules/invoices';

Service('ReportingService');
export class ReportingService {
  execute() { return true; }
}