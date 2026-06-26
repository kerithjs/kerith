import { pathToFileURL } from 'node:url';
import { KerithError } from '../core/errors.js';
import { withTimeout } from '../core/utils/timeout.js';

/**
 * Dynamic import of a Kerith index entry with MODULE_LOAD_TIMEOUT guard.
 */
export async function importIndexEntry(
  indexPath: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const importUrl = pathToFileURL(indexPath).href;

  return withTimeout(
    import(importUrl) as Promise<Record<string, unknown>>,
    timeoutMs,
    () =>
      new KerithError(
        'MODULE_LOAD_TIMEOUT',
        `Module load timed out after ${timeoutMs}ms. Check for unhandled promises or blocking operations in the top-level scope.`,
        `File: ${indexPath}`,
      ),
  );
}
