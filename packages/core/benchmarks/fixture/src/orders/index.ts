import { Module } from '../../../../src/index.js';
import { AuditService } from '@modules/audit';
import { HealthService } from '@modules/health';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';

Module('orders', {
  imports: ["audit","health","auth","rate-limiter"],
  exports: ['OrdersService']
});

export * from './orders.service.js';
export * from './orders.repository.js';
export * from './orders.schema.js';