// tests/data-structural.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Entity,
  Aggregate,
  ValueObject,
  Migration,
  Seed,
  Fixture,
  Snapshot,
  View,
  Index,
  Query,
  getStructuralEntries,
  getStructuralEntriesByCategory,
  getStructuralEntriesByType,
  _resetStructuralStore,
} from '../src/index.js';

describe('Data Structural Identifiers', () => {
  beforeEach(() => {
    _resetStructuralStore();
  });

  it('registers Entity with default inferred module and options', () => {
    Entity('UserEntity', { tableName: 'users' });
    const entries = getStructuralEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('UserEntity');
    expect(entries[0].type).toBe('Entity');
    expect(entries[0].category).toBe('data');
    expect(entries[0].trackable).toBe(true);
    expect(entries[0].options).toEqual({ tableName: 'users' });
    expect(entries[0].module).toBeDefined();
    expect(entries[0].filePath).toContain('data-structural.test.ts');
  });

  it('registers Fixture with trackable=false', () => {
    Fixture('UserFixture', { scope: 'unit' });
    const entries = getStructuralEntriesByType('Fixture');
    expect(entries).toHaveLength(1);
    expect(entries[0].trackable).toBe(false);
    expect(entries[0].options).toEqual({ scope: 'unit' });
  });

  it('respects explicit module override', () => {
    Migration('CreateUsersTable', { module: 'auth', version: '2026111301' });
    const entries = getStructuralEntriesByType('Migration');
    expect(entries).toHaveLength(1);
    expect(entries[0].module).toBe('auth');
    expect(entries[0].options.version).toBe('2026111301');
  });

  it('registers all 10 data structural identifiers correctly', () => {
    Entity('E1');
    Aggregate('A1');
    ValueObject('VO1');
    Migration('M1');
    Seed('S1');
    Fixture('F1');
    Snapshot('SN1');
    View('V1');
    Index('I1');
    Query('Q1');

    const dataEntries = getStructuralEntriesByCategory('data');
    expect(dataEntries).toHaveLength(10);
    const types = dataEntries.map((e) => e.type);
    expect(types).toEqual([
      'Entity',
      'Aggregate',
      'ValueObject',
      'Migration',
      'Seed',
      'Fixture',
      'Snapshot',
      'View',
      'Index',
      'Query',
    ]);
  });

  it('throws TypeError when name is empty or invalid', () => {
    expect(() => Entity('')).toThrow(TypeError);
    expect(() => Entity('   ')).toThrow(TypeError);
    // @ts-expect-error testing invalid type
    expect(() => Entity(123)).toThrow(TypeError);
  });
});

