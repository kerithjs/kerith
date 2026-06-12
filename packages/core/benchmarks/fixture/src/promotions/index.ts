import { Module } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { I18nService } from '@modules/i18n';
import { ConfigService } from '@modules/config';
import { AuthService } from '@modules/auth';

Module('promotions', {
  imports: ["metrics","i18n","config","auth"],
  exports: ['PromotionsService']
});

export * from './promotions.service.js';
export * from './promotions.repository.js';
export * from './promotions.schema.js';