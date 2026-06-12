import { Module } from '../../../../src/index.js';


Module('rate-limiter', {
  imports: [],
  exports: ['RateLimiterService']
});

export * from './rate-limiter.service.js';
export * from './rate-limiter.repository.js';
export * from './rate-limiter.schema.js';