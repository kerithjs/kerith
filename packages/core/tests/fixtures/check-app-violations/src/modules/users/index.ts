/* eslint-disable */
// @ts-ignore
import { Module } from '@kerith/core';
Module('users', { imports: ['orders'] });
export * from './users.service.js';
export * from './users.repository.js';
