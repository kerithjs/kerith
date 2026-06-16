import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { CryptoService } from '@modules/crypto';
import { RedisService } from '@modules/redis';
import { RateLimiterService } from '@modules/rate-limiter';

Module('reports', {
  imports: ["storage","crypto","redis","rate-limiter"],
  exports: ['ReportsService']
});

export * from './reports.service.js';
export * from './reports.repository.js';
export * from './reports.schema.js';