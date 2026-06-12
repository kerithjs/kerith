import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { SessionService } from '@modules/session';
import { UsersService } from '@modules/users';
import { MailerService } from '@modules/mailer';

Module('orders', {
  imports: ["storage","session","users","mailer"],
  exports: ['OrdersService']
});

export * from './orders.service.js';
export * from './orders.repository.js';
export * from './orders.schema.js';