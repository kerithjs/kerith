import { Module } from '@kerith/core';

Module('users', {
  imports: ['auth'],
  exports: ['UsersService']
});

export class UsersService {
  getUsers() {
    return [{ id: 1, name: 'Alice' }];
  }
}
