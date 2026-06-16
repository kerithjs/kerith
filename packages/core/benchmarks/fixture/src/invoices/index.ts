import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { SessionService } from '@modules/session';
import { LoggerService } from '@modules/logger';
import { AuditService } from '@modules/audit';

Module('invoices', {
  imports: ["storage","session","logger","audit"],
  exports: ['InvoicesService']
});

export * from './invoices.service.js';
export * from './invoices.repository.js';
export * from './invoices.schema.js';