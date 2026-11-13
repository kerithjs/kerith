// src/data/types.ts

import type { BaseStructuralOptions } from '../structural/types.js';

export interface EntityOptions extends BaseStructuralOptions {
  tableName?: string;
  schema?: string;
}

export interface AggregateOptions extends BaseStructuralOptions {
  rootEntity?: string;
}

export interface ValueObjectOptions extends BaseStructuralOptions {
  immutable?: boolean;
}

export interface MigrationOptions extends BaseStructuralOptions {
  version?: string | number;
  up?: () => Promise<void> | void;
  down?: () => Promise<void> | void;
}

export interface SeedOptions extends BaseStructuralOptions {
  environment?: string[];
}

export interface FixtureOptions extends BaseStructuralOptions {
  scope?: 'unit' | 'e2e' | 'integration';
}

export interface SnapshotOptions extends BaseStructuralOptions {
  frequency?: string;
}

export interface ViewOptions extends BaseStructuralOptions {
  materialized?: boolean;
}

export interface IndexOptions extends BaseStructuralOptions {
  fields?: string[];
  unique?: boolean;
}

export interface QueryOptions extends BaseStructuralOptions {
  cacheable?: boolean;
  ttl?: number;
}

