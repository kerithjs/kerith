import { Module } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { StorageService } from '@modules/storage';
import { MailerService } from '@modules/mailer';
import { RedisService } from '@modules/redis';

Module('reports', {
  imports: ["logger","storage","mailer","redis"],
  exports: ['ReportsService']
});

export * from './reports.service.js';
export * from './reports.repository.js';
export * from './reports.schema.js';