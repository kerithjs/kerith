import { Service } from '../../../../src/index.js';
import { RefundsService } from '@modules/refunds';
import { PaymentsService } from '@modules/payments';
import { AddressService } from '@modules/address';
import { InvoicesService } from '@modules/invoices';

Service('SupportService');
export class SupportService {
  execute() { return true; }
}