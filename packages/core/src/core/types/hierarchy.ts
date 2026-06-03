export type HierarchyLevel = 'domain' | 'module' | 'submodule';

export interface DomainOptions {
  /** Documentation only — does not affect runtime behavior. */
  description?: string;
}

export interface SubModuleOptions {
  /** Documentation only — does not affect runtime behavior. */
  description?: string;
}

export interface ModuleOptions {
  /** Modules this module depends on (within the same domain). */
  imports?: string[];
  /** Public API of the module within the domain. */
  exports?: string[];
  /** Global @shared resources — only `@shared` or subpaths. */
  shared?: string[];
  /** Documentation only — does not affect runtime behavior. */
  description?: string;
}
