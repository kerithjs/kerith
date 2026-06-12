import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { RateLimiterService } from '@modules/rate-limiter';
import { CryptoService } from '@modules/crypto';
import { AuditService } from '@modules/audit';

Module('tax', {
  imports: ["storage","rate-limiter","crypto","audit"],
  exports: ['TaxService']
});

export * from './tax.service.js';
export * from './tax.repository.js';
export * from './tax.schema.js';