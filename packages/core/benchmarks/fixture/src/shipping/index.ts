import { Module } from '../../../../src/index.js';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';
import { LoggerService } from '@modules/logger';
import { MetricsService } from '@modules/metrics';

Module('shipping', {
  imports: ["auth","rate-limiter","logger","metrics"],
  exports: ['ShippingService']
});

export * from './shipping.service.js';
export * from './shipping.repository.js';
export * from './shipping.schema.js';