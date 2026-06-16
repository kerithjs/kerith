import { Module } from '../../../../src/index.js';
import { MailerService } from '@modules/mailer';
import { RedisService } from '@modules/redis';
import { CryptoService } from '@modules/crypto';
import { UsersService } from '@modules/users';

Module('refunds', {
  imports: ["mailer","redis","crypto","users"],
  exports: ['RefundsService']
});

export * from './refunds.service.js';
export * from './refunds.repository.js';
export * from './refunds.schema.js';