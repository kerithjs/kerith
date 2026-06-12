import { Module } from '../../../../src/index.js';


Module('i18n', {
  imports: [],
  exports: ['I18nService']
});

export * from './i18n.service.js';
export * from './i18n.repository.js';
export * from './i18n.schema.js';