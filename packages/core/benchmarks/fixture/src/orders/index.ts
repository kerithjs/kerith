import { Module } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';
import { ConfigService } from '@modules/config';
import { RateLimiterService } from '@modules/rate-limiter';

Module('orders', {
  imports: ["session","storage","config","rate-limiter"],
  exports: ['OrdersService']
});

export * from './orders.service.js';
export * from './orders.repository.js';
export * from './orders.schema.js';