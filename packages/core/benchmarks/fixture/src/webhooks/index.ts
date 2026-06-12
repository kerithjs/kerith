import { Module } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { ReportsService } from '@modules/reports';
import { AnalyticsService } from '@modules/analytics';
import { NotificationsService } from '@modules/notifications';

Module('webhooks', {
  imports: ["promotions","reports","analytics","notifications"],
  exports: ['WebhooksService']
});

export * from './webhooks.service.js';
export * from './webhooks.repository.js';
export * from './webhooks.schema.js';