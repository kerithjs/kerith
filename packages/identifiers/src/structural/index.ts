// src/structural/index.ts

export {
  createStructuralIdentifier,
} from './_structural-factory.js';

export {
  registerStructuralEntry,
  getStructuralEntries,
  getStructuralEntriesByType,
  getStructuralEntriesByCategory,
  _resetStructuralStore,
} from './store.js';

export type {
  StructuralEntry,
  BaseStructuralOptions,
} from './types.js';

