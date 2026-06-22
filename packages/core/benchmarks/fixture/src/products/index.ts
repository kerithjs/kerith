import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { UsersService } from '@modules/users';
import { I18nService } from '@modules/i18n';
import { MetricsService } from '@modules/metrics';

Module('products', {
  imports: ["storage","users","i18n","metrics"],
  exports: ['ProductsService']
});

export * from './products.service.js';
export * from './products.repository.js';
export * from './products.schema.js';