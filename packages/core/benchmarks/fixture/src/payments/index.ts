import { Module } from '../../../../src/index.js';
import { I18nService } from '@modules/i18n';
import { MetricsService } from '@modules/metrics';
import { StorageService } from '@modules/storage';
import { SessionService } from '@modules/session';

Module('payments', {
  imports: ["i18n","metrics","storage","session"],
  exports: ['PaymentsService']
});

export * from './payments.service.js';
export * from './payments.repository.js';
export * from './payments.schema.js';