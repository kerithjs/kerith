import { Module } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';
import { RateLimiterService } from '@modules/rate-limiter';
import { ConfigService } from '@modules/config';

Module('billing', {
  imports: ["session","storage","rate-limiter","config"],
  exports: ['BillingService']
});

export * from './billing.service.js';
export * from './billing.repository.js';
export * from './billing.schema.js';