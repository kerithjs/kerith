import { Service } from '../../../../src/index.js';
import { WishlistService } from '@modules/wishlist';
import { InvoicesService } from '@modules/invoices';
import { ReviewsService } from '@modules/reviews';
import { AddressService } from '@modules/address';

Service('AdminService');
export class AdminService {
  execute() { return true; }
}