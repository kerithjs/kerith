import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { LoggerService } from '@modules/logger';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';

Module('payments', {
  imports: ["database","logger","auth","rate-limiter"],
  exports: ['PaymentsService']
});

export * from './payments.service.js';
export * from './payments.repository.js';
export * from './payments.schema.js';