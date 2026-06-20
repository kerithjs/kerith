import { Module } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { UsersService } from '@modules/users';
import { MailerService } from '@modules/mailer';
import { HealthService } from '@modules/health';

Module('products', {
  imports: ["session","users","mailer","health"],
  exports: ['ProductsService']
});

export * from './products.service.js';
export * from './products.repository.js';
export * from './products.schema.js';