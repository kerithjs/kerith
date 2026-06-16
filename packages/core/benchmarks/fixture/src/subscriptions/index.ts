import { Module } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { MailerService } from '@modules/mailer';
import { AuditService } from '@modules/audit';
import { I18nService } from '@modules/i18n';

Module('subscriptions', {
  imports: ["redis","mailer","audit","i18n"],
  exports: ['SubscriptionsService']
});

export * from './subscriptions.service.js';
export * from './subscriptions.repository.js';
export * from './subscriptions.schema.js';