import type { ControllerEntry } from '../types/index.js';

export interface AliasProvider {
  prefix: string;
  name: string;
  filePath: string;
  resolve: () => unknown;
}

export interface MiddlewareResolver {
  phase: 'pre' | 'post';
  priority: number;
  resolve(controller: ControllerEntry): unknown[];
}

export interface ScheduleProvider {
  name: string;
  timing: 'after-bootstrap' | 'on-listen' | 'on-shutdown';
  execute(): Promise<void> | void;
}

export interface BindingProvider {
  name: string;
  kind: string;
  bind(): Promise<void> | void;
}

export type IdentifierCategory =
  | 'infrastructure'
  | 'events'
  | 'workers'
  | 'security'
  | 'http'
  | 'data'
  | 'observability'
  | 'realtime'
  | 'api'
  | 'flags'
  | 'i18n'
  | 'cli'
  | 'testing';

export interface IdentifierMetadata {
  name: string;
  category: IdentifierCategory;
  kind: 'structural' | 'logical';
  channel?: 'alias' | 'middleware' | 'schedule' | 'binding';
  trackable: boolean;
}

