import { Module } from '../../../../src/index.js';


Module('health', {
  imports: [],
  exports: ['HealthService']
});

export * from './health.service.js';
export * from './health.repository.js';
export * from './health.schema.js';