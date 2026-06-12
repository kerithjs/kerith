import { Module } from '../../../../src/index.js';


Module('storage', {
  imports: [],
  exports: ['StorageService']
});

export * from './storage.service.js';
export * from './storage.repository.js';
export * from './storage.schema.js';