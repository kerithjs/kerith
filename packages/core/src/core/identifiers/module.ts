import { getActiveRegistry } from '../registry.js';
import { getModuleCallerInfo } from '../caller.js';
import { generateModuleId } from '../../nits/nits-id.js';
import { normalizePath } from '../utils/paths.js';
import { inferDomain, type DomainScanEntry } from '../../bootstrap/scanner.js';
import type { ModuleOptions } from '../types/hierarchy.js';
import { assertCalledFromIndex, assertNameMatchesFolder } from './validation.js';

function toDomainScanEntries(
  domains: { name: string; path: string }[],
): DomainScanEntry[] {
  return domains.map((d) => ({
    name: d.name,
    dirPath: d.path,
    indexPath: '',
    options: {},
  }));
}

/**
 * Declares a Kerith module and registers its options in the application registry.
 * Must be called from the module's index file.
 */
export function Module(name: string, options: ModuleOptions = {}): void {
  if (typeof name !== 'string') {
    throw new TypeError(`Module name must be a string, received ${typeof name}`);
  }

  const { filePath: indexPath, dirPath } = getModuleCallerInfo('Module()');

  assertNameMatchesFolder(name, dirPath, 'INVALID_MODULE_DECLARATION', 'Module');
  assertCalledFromIndex(indexPath, 'INVALID_MODULE_DECLARATION', 'Module');

  const registry = getActiveRegistry();
  const nitsId = registry.getNitsIdForPath(normalizePath(dirPath)) || generateModuleId();
  const domain = inferDomain(indexPath, toDomainScanEntries(registry.getAllDomains()));

  registry.registerModule(name, options, dirPath, indexPath, nitsId, domain);
}
