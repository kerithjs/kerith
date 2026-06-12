import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { I18nService } from '@modules/i18n';
import { ConfigService } from '@modules/config';
import { AuthService } from '@modules/auth';

Module('cart', {
  imports: ["database","i18n","config","auth"],
  exports: ['CartService']
});

export * from './cart.service.js';
export * from './cart.repository.js';
export * from './cart.schema.js';