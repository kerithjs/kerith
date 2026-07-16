/** Minimal in-memory db stub for fixture tests. */
export const db = {
  find: (id: string) => ({ id }),
}
