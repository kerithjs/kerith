import { Module } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { ConfigService } from '@modules/config';
import { StorageService } from '@modules/storage';
import { AuthService } from '@modules/auth';

Module('products', {
  imports: ["logger","config","storage","auth"],
  exports: ['ProductsService']
});

export * from './products.service.js';
export * from './products.repository.js';
export * from './products.schema.js';