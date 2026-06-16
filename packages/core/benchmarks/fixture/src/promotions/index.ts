import { Module } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { I18nService } from '@modules/i18n';
import { RateLimiterService } from '@modules/rate-limiter';
import { RedisService } from '@modules/redis';

Module('promotions', {
  imports: ["session","i18n","rate-limiter","redis"],
  exports: ['PromotionsService']
});

export * from './promotions.service.js';
export * from './promotions.repository.js';
export * from './promotions.schema.js';