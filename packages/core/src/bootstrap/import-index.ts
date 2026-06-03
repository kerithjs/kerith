import { pathToFileURL } from 'node:url';
import { KerithError } from '../core/errors.js';

/**
 * Dynamic import of a Kerith index entry with MODULE_LOAD_TIMEOUT guard.
 */
export async function importIndexEntry(
  indexPath: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const importUrl = pathToFileURL(indexPath).href;
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new KerithError(
          'MODULE_LOAD_TIMEOUT',
          `Module load timed out after ${timeoutMs}ms. Check for unhandled promises or blocking operations in the top-level scope.`,
          `File: ${indexPath}`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return (await Promise.race([import(importUrl), timeoutPromise])) as Record<
      string,
      unknown
    >;
  } finally {
    clearTimeout(timer!);
  }
}
