import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { RedisService } from '@modules/redis';
import { StorageService } from '@modules/storage';
import { MailerService } from '@modules/mailer';

Module('refunds', {
  imports: ["database","redis","storage","mailer"],
  exports: ['RefundsService']
});

export * from './refunds.service.js';
export * from './refunds.repository.js';
export * from './refunds.schema.js';