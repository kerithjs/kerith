/**
 * Utility function to wrap a promise with a timeout.
 * 
 * This encapsulates the Promise.race + setTimeout pattern, eliminating
 * the need for manual timer management and non-null assertions.
 * 
 * @param promise - The promise to wrap with a timeout
 * @param ms - Timeout duration in milliseconds
 * @param errorFactory - Function that creates the error to throw on timeout
 * @returns The promise result, or throws the timeout error
 * 
 * @example
 * ```ts
 * const result = await withTimeout(
 *   import('./module'),
 *   5000,
 *   () => new Error('Operation timed out')
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorFactory: () => Error
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(errorFactory()), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
