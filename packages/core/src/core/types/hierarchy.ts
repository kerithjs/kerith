export type HierarchyLevel = 'domain' | 'module' | 'submodule';

export interface DomainOptions {
  /** Documentation only — does not affect runtime behavior. */
  description?: string;
  /** Documentation only — lists sub-module folders within this domain. Does not affect runtime behavior. */
  subModules?: string[];
  /** Documentation only — lists module folders within this domain. Does not affect runtime behavior. */
  modules?: string[];
}

export interface SubModuleOptions {
  /** Documentation only — does not affect runtime behavior. */
  description?: string;
}

export interface ModuleOptions {
  /** Kerith modules this module depends on (within the same domain). */
  imports?: string[];
  /** Public API of the module within the domain. */
  exports?: string[];
  /**
   * Global shared resources this module declares it uses.
   * Only accepts `'@shared'` or subpaths of `'@shared'` (e.g. `'@shared/utils'`).
   * Access to `'@{domain}/shared'` is implicit via domain membership — do not list it here.
   * Never use module names or domain-scoped shared aliases in this array.
   * @example shared: ['@shared']
   */
  shared?: string[];
  /** Documentation only — does not affect runtime behavior. */
  description?: string;
}
