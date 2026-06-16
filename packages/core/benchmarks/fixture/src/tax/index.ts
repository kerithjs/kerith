import { Module } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { HealthService } from '@modules/health';
import { I18nService } from '@modules/i18n';
import { MailerService } from '@modules/mailer';

Module('tax', {
  imports: ["users","health","i18n","mailer"],
  exports: ['TaxService']
});

export * from './tax.service.js';
export * from './tax.repository.js';
export * from './tax.schema.js';