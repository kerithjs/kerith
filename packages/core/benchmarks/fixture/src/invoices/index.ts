import { Module } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { AuthService } from '@modules/auth';
import { RedisService } from '@modules/redis';
import { StorageService } from '@modules/storage';

Module('invoices', {
  imports: ["users","auth","redis","storage"],
  exports: ['InvoicesService']
});

export * from './invoices.service.js';
export * from './invoices.repository.js';
export * from './invoices.schema.js';