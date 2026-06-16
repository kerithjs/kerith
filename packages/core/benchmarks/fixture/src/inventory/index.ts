import { Module } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { RedisService } from '@modules/redis';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';

Module('inventory', {
  imports: ["logger","redis","session","storage"],
  exports: ['InventoryService']
});

export * from './inventory.service.js';
export * from './inventory.repository.js';
export * from './inventory.schema.js';