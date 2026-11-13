// src/observability/structural.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface LoggerOptions extends BaseStructuralOptions {
  level?: string;
  format?: 'json' | 'pretty';
}

export interface AlertOptions extends BaseStructuralOptions {
  severity?: 'critical' | 'warning' | 'info';
  channel?: string;
}

export interface DashboardOptions extends BaseStructuralOptions {
  refreshRateSeconds?: number;
}

export const Logger = createStructuralIdentifier<LoggerOptions>('Logger', 'observability', true);
export const Alert = createStructuralIdentifier<AlertOptions>('Alert', 'observability', true);
export const Dashboard = createStructuralIdentifier<DashboardOptions>('Dashboard', 'observability', true);

