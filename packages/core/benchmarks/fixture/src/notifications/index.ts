import { Module } from '../../../../src/index.js';
import { MailerService } from '@modules/mailer';
import { AuditService } from '@modules/audit';
import { LoggerService } from '@modules/logger';
import { I18nService } from '@modules/i18n';

Module('notifications', {
  imports: ["mailer","audit","logger","i18n"],
  exports: ['NotificationsService']
});

export * from './notifications.service.js';
export * from './notifications.repository.js';
export * from './notifications.schema.js';