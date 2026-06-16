import { Module } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { RateLimiterService } from '@modules/rate-limiter';
import { HealthService } from '@modules/health';
import { I18nService } from '@modules/i18n';

Module('reviews', {
  imports: ["users","rate-limiter","health","i18n"],
  exports: ['ReviewsService']
});

export * from './reviews.service.js';
export * from './reviews.repository.js';
export * from './reviews.schema.js';