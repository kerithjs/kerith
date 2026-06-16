import { Module } from '../../../../src/index.js';
import { InvoicesService } from '@modules/invoices';
import { ReportsService } from '@modules/reports';
import { PromotionsService } from '@modules/promotions';
import { ReviewsService } from '@modules/reviews';

Module('admin', {
  imports: ["invoices","reports","promotions","reviews"],
  exports: ['AdminService']
});

export * from './admin.service.js';
export * from './admin.repository.js';
export * from './admin.schema.js';