import { Module } from '../../../../src/index.js';
import { ConfigService } from '@modules/config';
import { RedisService } from '@modules/redis';
import { SessionService } from '@modules/session';
import { I18nService } from '@modules/i18n';

Module('orders', {
  imports: ["config","redis","session","i18n"],
  exports: ['OrdersService']
});

export * from './orders.service.js';
export * from './orders.repository.js';
export * from './orders.schema.js';