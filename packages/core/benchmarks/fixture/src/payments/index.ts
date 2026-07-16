import { Module } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { LoggerService } from '@modules/logger';
import { StorageService } from '@modules/storage';
import { I18nService } from '@modules/i18n';

Module('payments', {
  imports: ["users","logger","storage","i18n"],
  exports: ['PaymentsService']
});

export * from './payments.service.js';
export * from './payments.repository.js';
export * from './payments.schema.js';