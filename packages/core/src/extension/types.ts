import type { ControllerEntry } from '../types/index.js';

export interface AliasProvider {
  prefix: string;
  name: string;
  filePath: string;
  resolve: () => unknown;
}

export interface MiddlewareResolver {
  phase: 'pre' | 'post' | 'error';
  /**
   * Order within the phase. Higher priority runs first — Core sorts
   * descending (`sort((a, b) => b.priority - a.priority)`), fixed by the
   * vertical-slice test suite. `@kerith/identifiers`' `MiddlewarePlugin.priority`
   * must be translated 1:1 into this field without inverting it.
   */
  priority: number;
  /**
   * For `phase: 'error'`, must return the SAME function reference on every
   * call if the resolver is meant to be mounted once globally — Core
   * deduplicates error handlers by identity (`Set`), called once per
   * mounted controller. A resolver that builds a new closure per call will
   * be mounted once per controller instead of once total.
   */
  getHandlers(controller: ControllerEntry): unknown[];
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

