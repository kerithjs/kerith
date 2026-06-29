import type { HierarchyLevel } from './hierarchy.js';

export interface DomainRegistration {
  id?: string;
  name: string;
  path: string;
  description?: string;
  registeredAt: string;
}

export interface SubModuleRegistration {
  name: string;
  path: string;
  parentModule: string;
  domain?: string;
  description?: string;
}

export interface ModuleRegistration {
  id: string;
  name: string;
  path: string;
  domain?: string;
  imports: string[];
  exports: string[];
  controllers: string[];
}

export function buildModuleKey(name: string, domain?: string): string {
  return domain ? `${domain}/${name}` : name;
}

export function buildSubModuleQualifiedName(
  name: string,
  parentModule: string,
  domain?: string,
): string {
  return domain ? `${domain}/${parentModule}/${name}` : `${parentModule}/${name}`;
}

export type { HierarchyLevel };
