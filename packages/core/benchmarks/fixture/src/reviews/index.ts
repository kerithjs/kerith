import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { I18nService } from '@modules/i18n';
import { RateLimiterService } from '@modules/rate-limiter';
import { AuditService } from '@modules/audit';

Module('reviews', {
  imports: ["database","i18n","rate-limiter","audit"],
  exports: ['ReviewsService']
});

export * from './reviews.service.js';
export * from './reviews.repository.js';
export * from './reviews.schema.js';