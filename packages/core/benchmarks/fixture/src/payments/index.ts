import { Module } from '../../../../src/index.js';
import { HealthService } from '@modules/health';
import { LoggerService } from '@modules/logger';
import { DatabaseService } from '@modules/database';
import { UsersService } from '@modules/users';

Module('payments', {
  imports: ["health","logger","database","users"],
  exports: ['PaymentsService']
});

export * from './payments.service.js';
export * from './payments.repository.js';
export * from './payments.schema.js';