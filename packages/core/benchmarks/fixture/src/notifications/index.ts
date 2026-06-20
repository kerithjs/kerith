import { Module } from '../../../../src/index.js';
import { AuditService } from '@modules/audit';
import { DatabaseService } from '@modules/database';
import { StorageService } from '@modules/storage';
import { ConfigService } from '@modules/config';

Module('notifications', {
  imports: ["audit","database","storage","config"],
  exports: ['NotificationsService']
});

export * from './notifications.service.js';
export * from './notifications.repository.js';
export * from './notifications.schema.js';