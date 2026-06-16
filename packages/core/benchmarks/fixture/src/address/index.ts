import { Module } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { AuthService } from '@modules/auth';
import { MailerService } from '@modules/mailer';
import { RedisService } from '@modules/redis';

Module('address', {
  imports: ["logger","auth","mailer","redis"],
  exports: ['AddressService']
});

export * from './address.service.js';
export * from './address.repository.js';
export * from './address.schema.js';