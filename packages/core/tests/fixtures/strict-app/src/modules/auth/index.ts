import { Module } from '@kerith/core';

Module('auth', {
  imports: ['core'],
  exports: ['AuthService']
});

export class AuthService {
  isAuthenticated() {
    return true;
  }
}
