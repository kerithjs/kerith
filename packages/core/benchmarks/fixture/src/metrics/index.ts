import { Module } from '../../../../src/index.js';


Module('metrics', {
  imports: [],
  exports: ['MetricsService']
});

export * from './metrics.service.js';
export * from './metrics.repository.js';
export * from './metrics.schema.js';