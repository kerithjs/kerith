import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { SessionService } from '@modules/session';
import { AuthService } from '@modules/auth';
import { MetricsService } from '@modules/metrics';

Module('notifications', {
  imports: ["database","session","auth","metrics"],
  exports: ['NotificationsService']
});

export * from './notifications.service.js';
export * from './notifications.repository.js';
export * from './notifications.schema.js';