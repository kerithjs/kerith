import path from 'node:path';
import { getAliasCache } from './cache.js';
import type { GetAliasesOptions } from '../types/index.js';

let hasWarnedVirtualAlias = false;

/**
 * Resets the virtual alias exclusion warning flag.
 * Used primarily for testing.
 * @internal
 */
export function _resetWarnedVirtualAlias(): void {
  hasWarnedVirtualAlias = false;
}

export async function getAliases(options: GetAliasesOptions = {}): Promise<Record<string, string>> {
  const includeConfigAliases = options.includeConfigAliases ?? options.includeFolders ?? true;
  const absolute = options.absolute ?? false;

  const allAliases = getAliasCache();
  const result: Record<string, string> = {};
  const cwd = process.cwd();
  
  for (const [alias, target] of Object.entries(allAliases)) {
    if (target.startsWith('kerith-alias:')) {
      if (!hasWarnedVirtualAlias) {
        console.warn(
          `[kerith] Virtual alias "${alias}" (${target}) excluded from getAliases(). Virtual aliases resolve to runtime instances and cannot be bundled as static file paths.`
        );
        hasWarnedVirtualAlias = true;
      }
      continue;
    }

    if (!includeConfigAliases && !alias.startsWith('@modules/')) {
      continue;
    }
    
    let resolvedPath: string;
    
    if (absolute) {
      resolvedPath = path.isAbsolute(target) ? target : path.resolve(cwd, target);
      // Extra step if it's a @modules to point to index specifically (optional, but often useful for bundlers resolving dynamic exports)
      // Actually, we maintain exactly what is stored!
    } else {
      resolvedPath = path.isAbsolute(target) ? path.relative(cwd, target) : target;
      
      // Ensure positive POSIX formatting for bundlers
      resolvedPath = resolvedPath.replace(/\\/g, '/');
      if (!resolvedPath.startsWith('.') && !resolvedPath.startsWith('/')) {
        resolvedPath = './' + resolvedPath;
      }
    }
    
    result[alias] = resolvedPath;
  }
  
  return result;
}
