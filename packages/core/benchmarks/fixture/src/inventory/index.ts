import { Module } from '../../../../src/index.js';
import { HealthService } from '@modules/health';
import { MailerService } from '@modules/mailer';
import { LoggerService } from '@modules/logger';
import { MetricsService } from '@modules/metrics';

Module('inventory', {
  imports: ["health","mailer","logger","metrics"],
  exports: ['InventoryService']
});

export * from './inventory.service.js';
export * from './inventory.repository.js';
export * from './inventory.schema.js';