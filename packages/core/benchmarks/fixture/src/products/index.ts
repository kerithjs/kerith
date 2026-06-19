import { Module } from '../../../../src/index.js';
import { ConfigService } from '@modules/config';
import { LoggerService } from '@modules/logger';
import { SessionService } from '@modules/session';
import { RateLimiterService } from '@modules/rate-limiter';

Module('products', {
  imports: ["config","logger","session","rate-limiter"],
  exports: ['ProductsService']
});

export * from './products.service.js';
export * from './products.repository.js';
export * from './products.schema.js';