import { Service } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { AddressService } from '@modules/address';
import { SearchService } from '@modules/search';
import { ReportsService } from '@modules/reports';

Service('CheckoutService');
export class CheckoutService {
  execute() { return true; }
}