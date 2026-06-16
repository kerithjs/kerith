import { Module } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { HealthService } from '@modules/health';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';

Module('cart', {
  imports: ["users","health","session","storage"],
  exports: ['CartService']
});

export * from './cart.service.js';
export * from './cart.repository.js';
export * from './cart.schema.js';