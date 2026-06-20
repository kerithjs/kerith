import { Module } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { UsersService } from '@modules/users';
import { SessionService } from '@modules/session';
import { AuditService } from '@modules/audit';

Module('notifications', {
  imports: ["logger","users","session","audit"],
  exports: ['NotificationsService']
});

export * from './notifications.service.js';
export * from './notifications.repository.js';
export * from './notifications.schema.js';