import { Module } from '../../../../src/index.js';


Module('audit', {
  imports: [],
  exports: ['AuditService']
});

export * from './audit.service.js';
export * from './audit.repository.js';
export * from './audit.schema.js';