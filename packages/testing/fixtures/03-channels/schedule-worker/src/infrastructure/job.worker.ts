import { jobState } from './state.js'

// Simulate a "worker" by re-using Cron infrastructure (no Redis/BullMQ needed).
// The job performs a state mutation when dispatched explicitly via /dispatch.
// This is the observable side-effect the test validates.
export function dispatch(): void {
  jobState.count++
}
