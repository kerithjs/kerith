import { Service } from '../../../../src/index.js';
import { ProductsService } from '@modules/products';
import { SearchService } from '@modules/search';
import { AddressService } from '@modules/address';
import { InvoicesService } from '@modules/invoices';

Service('ComplianceService');
export class ComplianceService {
  execute() { return true; }
}