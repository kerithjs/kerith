import { Module } from '@kerith/core';

Module('core', {
  exports: ['CoreService']
});

export class CoreService {
  getData() {
    return 'core-data';
  }
}
