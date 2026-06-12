import { Module } from '../../../../src/index.js';


Module('database', {
  imports: [],
  exports: ['DatabaseService']
});

export * from './database.service.js';
export * from './database.repository.js';
export * from './database.schema.js';