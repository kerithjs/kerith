import { Service } from '../../../../src/index.js';
import { CartService } from '@modules/cart';
import { InvoicesService } from '@modules/invoices';
import { AddressService } from '@modules/address';
import { BillingService } from '@modules/billing';

Service('CheckoutService');
export class CheckoutService {
  execute() { return true; }
}