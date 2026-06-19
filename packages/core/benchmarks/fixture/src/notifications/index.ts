import { Module } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { StorageService } from '@modules/storage';
import { RedisService } from '@modules/redis';
import { I18nService } from '@modules/i18n';

Module('notifications', {
  imports: ["metrics","storage","redis","i18n"],
  exports: ['NotificationsService']
});

export * from './notifications.service.js';
export * from './notifications.repository.js';
export * from './notifications.schema.js';