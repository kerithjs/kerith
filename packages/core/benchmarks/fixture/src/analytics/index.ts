import { Module } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { DatabaseService } from '@modules/database';
import { StorageService } from '@modules/storage';
import { HealthService } from '@modules/health';

Module('analytics', {
  imports: ["redis","database","storage","health"],
  exports: ['AnalyticsService']
});

export * from './analytics.service.js';
export * from './analytics.repository.js';
export * from './analytics.schema.js';