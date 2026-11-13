// src/api/index.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface EndpointOptions extends BaseStructuralOptions {
  method?: string;
  path?: string;
}

export interface RouteOptions extends BaseStructuralOptions {
  pattern?: string;
}

export interface ContractOptions extends BaseStructuralOptions {
  version?: string;
  schema?: unknown;
}

export interface ResolverOptions extends BaseStructuralOptions {
  type?: string;
}

export interface MutationOptions extends BaseStructuralOptions {
  returns?: string;
}

export interface SubscriptionOptions extends BaseStructuralOptions {
  topic?: string;
}

export interface ProcedureOptions extends BaseStructuralOptions {
  type?: 'query' | 'mutation' | 'subscription';
}

export interface ResourceOptions extends BaseStructuralOptions {
  plural?: string;
}

export const Endpoint = createStructuralIdentifier<EndpointOptions>('Endpoint', 'api', true);
export const Route = createStructuralIdentifier<RouteOptions>('Route', 'api', true);
export const Contract = createStructuralIdentifier<ContractOptions>('Contract', 'api', true);
export const Resolver = createStructuralIdentifier<ResolverOptions>('Resolver', 'api', true);
export const Mutation = createStructuralIdentifier<MutationOptions>('Mutation', 'api', true);
export const Subscription = createStructuralIdentifier<SubscriptionOptions>('Subscription', 'api', true);
export const Procedure = createStructuralIdentifier<ProcedureOptions>('Procedure', 'api', true);
export const Resource = createStructuralIdentifier<ResourceOptions>('Resource', 'api', true);

