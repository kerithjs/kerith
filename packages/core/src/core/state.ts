import { clearAliasCache } from '../aliases/cache.js';
import { clearAliasResolverOptions } from '../aliases/resolver.js';

/**
 * Resets all global Kerith state.
 * Primarily intended for use in test suites to prevent state leakage between runs.
 * 
 * @internal — This is not part of the public Kerith API.
 */
export function resetGlobalState(): void {
  clearAliasCache();
  clearAliasResolverOptions();
}
