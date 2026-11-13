// src/infrastructure/structural.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface RegistryOptions extends BaseStructuralOptions {
  scope?: 'global' | 'module' | 'domain';
}

export interface ConnectionOptions extends BaseStructuralOptions {
  protocol?: string;
  host?: string;
  port?: number;
}

export interface PoolOptions extends BaseStructuralOptions {
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
}

export const Registry = createStructuralIdentifier<RegistryOptions>('Registry', 'infrastructure', true);
export const Connection = createStructuralIdentifier<ConnectionOptions>('Connection', 'infrastructure', true);
export const Pool = createStructuralIdentifier<PoolOptions>('Pool', 'infrastructure', true);
