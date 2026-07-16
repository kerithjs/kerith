import { Module } from '../../../../src/index.js';


Module('users', {
  imports: [],
  exports: ['UsersService']
});

export * from './users.service.js';
export * from './users.repository.js';
export * from './users.schema.js';