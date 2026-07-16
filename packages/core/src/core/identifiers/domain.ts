import { getActiveRegistry } from '../registry.js';
import { getModuleCallerInfo } from '../caller.js';
import { normalizePath } from '../utils/paths.js';
import type { DomainOptions } from '../types/hierarchy.js';
import { assertCalledFromIndex, assertNameMatchesFolder } from './validation.js';

/**
 * Declares a Kerith domain (semantic marker). Hierarchy is inferred from the filesystem.
 * Must be called from the domain's index file.
 */
export function Domain(name: string, options: DomainOptions = {}): void {
  if (typeof name !== 'string') {
    throw new TypeError(`Domain name must be a string, received ${typeof name}`);
  }

  const { filePath: indexPath, dirPath } = getModuleCallerInfo('Domain()');

  assertNameMatchesFolder(name, dirPath, 'INVALID_DOMAIN_DECLARATION', 'Domain');
  assertCalledFromIndex(indexPath, 'INVALID_DOMAIN_DECLARATION', 'Domain');

  const registry = getActiveRegistry();
  const existing = registry.getDomain(name);
  if (existing && normalizePath(existing.path) === normalizePath(dirPath)) {
    return;
  }

  registry.registerDomain({
    name,
    path: dirPath,
    description: options.description,
    registeredAt: new Date().toISOString(),
  });
}
