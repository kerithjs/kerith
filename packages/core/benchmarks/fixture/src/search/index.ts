import { Module } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { StorageService } from '@modules/storage';
import { MetricsService } from '@modules/metrics';
import { HealthService } from '@modules/health';

Module('search', {
  imports: ["users","storage","metrics","health"],
  exports: ['SearchService']
});

export * from './search.service.js';
export * from './search.repository.js';
export * from './search.schema.js';