import { Module } from '../../../../src/index.js';
import { CryptoService } from '@modules/crypto';
import { SessionService } from '@modules/session';
import { HealthService } from '@modules/health';
import { I18nService } from '@modules/i18n';

Module('recommendations', {
  imports: ["crypto","session","health","i18n"],
  exports: ['RecommendationsService']
});

export * from './recommendations.service.js';
export * from './recommendations.repository.js';
export * from './recommendations.schema.js';