import { Module } from '../../../../src/index.js';


Module('crypto', {
  imports: [],
  exports: ['CryptoService']
});

export * from './crypto.service.js';
export * from './crypto.repository.js';
export * from './crypto.schema.js';