import { Module } from '../../../../src/index.js';


Module('auth', {
  imports: [],
  exports: ['AuthService']
});

export * from './auth.service.js';
export * from './auth.repository.js';
export * from './auth.schema.js';