import { Module } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { CryptoService } from '@modules/crypto';
import { HealthService } from '@modules/health';
import { AuthService } from '@modules/auth';

Module('orders', {
  imports: ["redis","crypto","health","auth"],
  exports: ['OrdersService']
});

export * from './orders.service.js';
export * from './orders.repository.js';
export * from './orders.schema.js';