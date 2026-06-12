import { Module } from '../../../../src/index.js';


Module('config', {
  imports: [],
  exports: ['ConfigService']
});

export * from './config.service.js';
export * from './config.repository.js';
export * from './config.schema.js';