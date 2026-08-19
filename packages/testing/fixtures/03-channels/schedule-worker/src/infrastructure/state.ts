// Shared mutable state — a single object reference so all importers see the same counter.
export const jobState = { count: 0 }

export function dispatch(): void {
  jobState.count++
}
