import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { StorageService } from '@modules/storage';
import { AuditService } from '@modules/audit';
import { HealthService } from '@modules/health';

Module('recommendations', {
  imports: ["database","storage","audit","health"],
  exports: ['RecommendationsService']
});

export * from './recommendations.service.js';
export * from './recommendations.repository.js';
export * from './recommendations.schema.js';