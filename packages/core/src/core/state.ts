import { clearAliasCache } from '../aliases/cache.js';
import { clearAliasResolverOptions } from '../aliases/resolver.js';
import { resetBootstrapGuard } from '../bootstrap/steps/step-00-guard.js';

/**
 * Resets all global Kerith state (aliases, alias resolver options, and bootstrap guard).
 * Primarily intended for use in test suites to prevent state leakage between runs.
 * 
 * @internal — This is not part of the public Kerith API.
 */
export function resetGlobalState(): void {
  clearAliasCache();
  clearAliasResolverOptions();
  resetBootstrapGuard();
}

