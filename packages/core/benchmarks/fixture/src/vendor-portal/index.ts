import { Module } from '../../../../src/index.js';
import { InvoicesService } from '@modules/invoices';
import { AnalyticsService } from '@modules/analytics';
import { SearchService } from '@modules/search';
import { ReportsService } from '@modules/reports';

Module('vendor-portal', {
  imports: ["invoices","analytics","search","reports"],
  exports: ['VendorPortalService']
});

export * from './vendor-portal.service.js';
export * from './vendor-portal.repository.js';
export * from './vendor-portal.schema.js';