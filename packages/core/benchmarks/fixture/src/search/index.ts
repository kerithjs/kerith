import { Module } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { I18nService } from '@modules/i18n';
import { CryptoService } from '@modules/crypto';
import { AuthService } from '@modules/auth';

Module('search', {
  imports: ["metrics","i18n","crypto","auth"],
  exports: ['SearchService']
});

export * from './search.service.js';
export * from './search.repository.js';
export * from './search.schema.js';