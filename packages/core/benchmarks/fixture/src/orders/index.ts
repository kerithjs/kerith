import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { RedisService } from '@modules/redis';
import { MailerService } from '@modules/mailer';
import { AuditService } from '@modules/audit';

Module('orders', {
  imports: ["database","redis","mailer","audit"],
  exports: ['OrdersService']
});

export * from './orders.service.js';
export * from './orders.repository.js';
export * from './orders.schema.js';