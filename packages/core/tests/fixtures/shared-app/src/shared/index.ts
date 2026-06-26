// @shared — global shared resources of the project
// Export from here everything that modules need to share between domains.

/** Formats a value as a string. */
export function format(value: unknown): string {
  return String(value)
}
