// src/security/structural.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface PolicyOptions extends BaseStructuralOptions {
  effect?: 'allow' | 'deny';
  actions?: string[];
}

export interface PermissionOptions extends BaseStructuralOptions {
  resource?: string;
  action?: string;
}

export interface RoleOptions extends BaseStructuralOptions {
  permissions?: string[];
  inherits?: string[];
}

export interface ScopeOptions extends BaseStructuralOptions {
  claims?: string[];
}

export interface TokenOptions extends BaseStructuralOptions {
  expiresIn?: string | number;
  issuer?: string;
}

export interface SessionOptions extends BaseStructuralOptions {
  ttl?: number;
  sliding?: boolean;
}

export interface AuditOptions extends BaseStructuralOptions {
  level?: 'info' | 'warn' | 'security';
  retentionDays?: number;
}

export const Policy = createStructuralIdentifier<PolicyOptions>('Policy', 'security', true);
export const Permission = createStructuralIdentifier<PermissionOptions>('Permission', 'security', true);
export const Role = createStructuralIdentifier<RoleOptions>('Role', 'security', true);
export const Scope = createStructuralIdentifier<ScopeOptions>('Scope', 'security', true);
export const Token = createStructuralIdentifier<TokenOptions>('Token', 'security', true);
export const Session = createStructuralIdentifier<SessionOptions>('Session', 'security', true);
export const Audit = createStructuralIdentifier<AuditOptions>('Audit', 'security', true);
