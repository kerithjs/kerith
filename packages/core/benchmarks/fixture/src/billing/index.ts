import { Module } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { ConfigService } from '@modules/config';
import { CryptoService } from '@modules/crypto';
import { StorageService } from '@modules/storage';

Module('billing', {
  imports: ["metrics","config","crypto","storage"],
  exports: ['BillingService']
});

export * from './billing.service.js';
export * from './billing.repository.js';
export * from './billing.schema.js';