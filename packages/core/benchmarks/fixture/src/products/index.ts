import { Module } from '../../../../src/index.js';
import { AuthService } from '@modules/auth';
import { UsersService } from '@modules/users';
import { MetricsService } from '@modules/metrics';
import { MailerService } from '@modules/mailer';

Module('products', {
  imports: ["auth","users","metrics","mailer"],
  exports: ['ProductsService']
});

export * from './products.service.js';
export * from './products.repository.js';
export * from './products.schema.js';