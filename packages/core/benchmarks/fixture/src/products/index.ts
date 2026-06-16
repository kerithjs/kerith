import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';
import { HealthService } from '@modules/health';

Module('products', {
  imports: ["database","auth","rate-limiter","health"],
  exports: ['ProductsService']
});

export * from './products.service.js';
export * from './products.repository.js';
export * from './products.schema.js';