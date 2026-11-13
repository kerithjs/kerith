// src/flags/index.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface FlagOptions extends BaseStructuralOptions {
  defaultValue?: boolean;
}

export interface ExperimentOptions extends BaseStructuralOptions {
  variants?: string[];
}

export interface VariantOptions extends BaseStructuralOptions {
  weight?: number;
}

export interface RolloutOptions extends BaseStructuralOptions {
  percentage?: number;
}

export const Flag = createStructuralIdentifier<FlagOptions>('Flag', 'flags', true);
export const Experiment = createStructuralIdentifier<ExperimentOptions>('Experiment', 'flags', true);
export const Variant = createStructuralIdentifier<VariantOptions>('Variant', 'flags', true);
export const Rollout = createStructuralIdentifier<RolloutOptions>('Rollout', 'flags', true);
