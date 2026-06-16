import { Module } from '../../../../src/index.js';
import { ProductsService } from '@modules/products';
import { SearchService } from '@modules/search';
import { AddressService } from '@modules/address';
import { InvoicesService } from '@modules/invoices';

Module('compliance', {
  imports: ["products","search","address","invoices"],
  exports: ['ComplianceService']
});

export * from './compliance.service.js';
export * from './compliance.repository.js';
export * from './compliance.schema.js';