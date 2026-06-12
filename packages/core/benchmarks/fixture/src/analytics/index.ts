import { Module } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { UsersService } from '@modules/users';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';

Module('analytics', {
  imports: ["database","users","session","storage"],
  exports: ['AnalyticsService']
});

export * from './analytics.service.js';
export * from './analytics.repository.js';
export * from './analytics.schema.js';