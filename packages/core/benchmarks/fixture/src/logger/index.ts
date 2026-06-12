import { Module } from '../../../../src/index.js';


Module('logger', {
  imports: [],
  exports: ['LoggerService']
});

export * from './logger.service.js';
export * from './logger.repository.js';
export * from './logger.schema.js';