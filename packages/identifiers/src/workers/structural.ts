// src/workers/structural.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface JobOptions extends BaseStructuralOptions {
  queue?: string;
  concurrency?: number;
}

export interface TaskOptions extends BaseStructuralOptions {
  timeoutMs?: number;
}

export interface StepOptions extends BaseStructuralOptions {
  pipeline?: string;
  order?: number;
}

export interface SchedulerOptions extends BaseStructuralOptions {
  strategy?: 'fifo' | 'priority' | 'round-robin';
}

export interface RunnerOptions extends BaseStructuralOptions {
  concurrency?: number;
}

export const Job = createStructuralIdentifier<JobOptions>('Job', 'workers', true);
export const Task = createStructuralIdentifier<TaskOptions>('Task', 'workers', true);
export const Step = createStructuralIdentifier<StepOptions>('Step', 'workers', true);
export const Scheduler = createStructuralIdentifier<SchedulerOptions>('Scheduler', 'workers', true);
export const Runner = createStructuralIdentifier<RunnerOptions>('Runner', 'workers', true);
