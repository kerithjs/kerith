import { Module } from '../../../../src/index.js';
import { CryptoService } from '@modules/crypto';
import { RedisService } from '@modules/redis';
import { MailerService } from '@modules/mailer';
import { ConfigService } from '@modules/config';

Module('payments', {
  imports: ["crypto","redis","mailer","config"],
  exports: ['PaymentsService']
});

export * from './payments.service.js';
export * from './payments.repository.js';
export * from './payments.schema.js';