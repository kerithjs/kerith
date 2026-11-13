// src/data/index.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type {
  EntityOptions,
  AggregateOptions,
  ValueObjectOptions,
  MigrationOptions,
  SeedOptions,
  FixtureOptions,
  SnapshotOptions,
  ViewOptions,
  IndexOptions,
  QueryOptions,
} from './types.js';

export const Entity = createStructuralIdentifier<EntityOptions>('Entity', 'data', true);
export const Aggregate = createStructuralIdentifier<AggregateOptions>('Aggregate', 'data', true);
export const ValueObject = createStructuralIdentifier<ValueObjectOptions>('ValueObject', 'data', true);
export const Migration = createStructuralIdentifier<MigrationOptions>('Migration', 'data', true);
export const Seed = createStructuralIdentifier<SeedOptions>('Seed', 'data', true);
export const Fixture = createStructuralIdentifier<FixtureOptions>('Fixture', 'data', false);
export const Snapshot = createStructuralIdentifier<SnapshotOptions>('Snapshot', 'data', true);
export const View = createStructuralIdentifier<ViewOptions>('View', 'data', true);
export const Index = createStructuralIdentifier<IndexOptions>('Index', 'data', true);
export const Query = createStructuralIdentifier<QueryOptions>('Query', 'data', true);

export type * from './types.js';

