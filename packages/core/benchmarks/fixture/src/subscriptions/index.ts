import { Module } from '../../../../src/index.js';
import { HealthService } from '@modules/health';
import { AuditService } from '@modules/audit';
import { StorageService } from '@modules/storage';
import { AuthService } from '@modules/auth';

Module('subscriptions', {
  imports: ["health","audit","storage","auth"],
  exports: ['SubscriptionsService']
});

export * from './subscriptions.service.js';
export * from './subscriptions.repository.js';
export * from './subscriptions.schema.js';