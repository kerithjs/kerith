import { Module } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { ConfigService } from '@modules/config';
import { MetricsService } from '@modules/metrics';
import { MailerService } from '@modules/mailer';

Module('payments', {
  imports: ["session","config","metrics","mailer"],
  exports: ['PaymentsService']
});

export * from './payments.service.js';
export * from './payments.repository.js';
export * from './payments.schema.js';