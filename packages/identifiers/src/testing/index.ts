// src/testing/index.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface MockOptions extends BaseStructuralOptions {
  target?: string;
}

export interface StubOptions extends BaseStructuralOptions {
  returns?: unknown;
}

export interface FactoryOptions extends BaseStructuralOptions {
  model?: string;
}

export interface ScenarioOptions extends BaseStructuralOptions {
  tags?: string[];
}

export const Mock = createStructuralIdentifier<MockOptions>('Mock', 'testing', false);
export const Stub = createStructuralIdentifier<StubOptions>('Stub', 'testing', false);
export const Factory = createStructuralIdentifier<FactoryOptions>('Factory', 'testing', false);
export const Scenario = createStructuralIdentifier<ScenarioOptions>('Scenario', 'testing', false);
