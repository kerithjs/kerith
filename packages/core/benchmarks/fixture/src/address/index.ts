import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { I18nService } from '@modules/i18n';
import { HealthService } from '@modules/health';
import { ConfigService } from '@modules/config';

Module('address', {
  imports: ["storage","i18n","health","config"],
  exports: ['AddressService']
});

export * from './address.service.js';
export * from './address.repository.js';
export * from './address.schema.js';