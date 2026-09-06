/**
 * @kerith/testing — Public API
 *
 * Subprocess-based E2E harness for Kerith projects.
 * Import from this barrel — never from internal files.
 */

// Subprocess management (spawn, stop, failure, double-run)
export {
  runFixture,
  stopFixture,
  runFixtureExpectingFailure,
  runFixtureTwice,
} from './process.js';

// Health-gate (poll /health until 200 or timeout)
export { waitForHealth } from './health.js';

// HTTP client factory
export { createHttpClient } from './http-client.js';

// Fixture artifact readers
export { readManifest, readRegistrySnapshot, readDomainRegistrySnapshot } from './readers.js';

// Assertions
export { runEndpointAssertions } from './assertions.js';

// Shared types (re-exported for test files)
export type {
  FixtureHandle,
  FixtureOpts,
  FailureResult,
  HttpClient,
  HttpMethod,
  RequestOpts,
  Manifest,
  ManifestEndpoint,
  RegistrySnapshot,
  RegistryRecord,
  RegistryModule,
} from './types.js';

