import type { RequestHandler } from 'express';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type ParamSource = 'body' | 'param' | 'query' | 'headers' | 'req' | 'res';

export interface ParamDefinition {
  index: number;
  source: ParamSource;
  key?: string;
}

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handlerKey: string;
  params?: ParamDefinition[];
  metadata?: Record<string, unknown>;
}

export interface RouteOptions {
  metadata?: Record<string, unknown>;
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
