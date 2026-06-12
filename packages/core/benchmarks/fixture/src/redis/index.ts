import { Module } from '../../../../src/index.js';


Module('redis', {
  imports: [],
  exports: ['RedisService']
});

export * from './redis.service.js';
export * from './redis.repository.js';
export * from './redis.schema.js';