import { Module } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { CryptoService } from '@modules/crypto';
import { MailerService } from '@modules/mailer';
import { DatabaseService } from '@modules/database';

Module('notifications', {
  imports: ["logger","crypto","mailer","database"],
  exports: ['NotificationsService']
});

export * from './notifications.service.js';
export * from './notifications.repository.js';
export * from './notifications.schema.js';