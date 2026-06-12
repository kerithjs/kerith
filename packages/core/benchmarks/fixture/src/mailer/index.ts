import { Module } from '../../../../src/index.js';


Module('mailer', {
  imports: [],
  exports: ['MailerService']
});

export * from './mailer.service.js';
export * from './mailer.repository.js';
export * from './mailer.schema.js';