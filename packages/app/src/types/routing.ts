import type { RequestHandler } from 'express';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handlerKey: string;
}

export interface AppControllerOptions {
  middlewares?: RequestHandler[];
  metadata?: Record<string, unknown>;
  /**
   * When false, the controller is registered but skipped during route mounting.
   * Defaults to true if not specified.
   * Mirrors the `enabled` field in ControllerEntry from @kerith/core.
   */
  enabled?: boolean;
}


export interface AppControllerMeta {
  prefix: string;
  routes: RouteDefinition[];
  middlewares: RequestHandler[];
  metadata?: Record<string, unknown>;
  /** Forwarded directly to ControllerEntry.enabled. Defaults to true. */
  enabled?: boolean;
}
