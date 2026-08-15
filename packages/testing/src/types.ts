/**
 * types.ts — Shared types for the @kerith/testing harness.
 */

import type { ChildProcess } from 'node:child_process';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FixtureOpts {
  /**
   * Milliseconds to wait for the health-gate before declaring failure.
   * @default 10_000
   */
  healthTimeoutMs?: number;

  /**
   * Extra environment variables forwarded to the child process.
   * PORT is always injected by the harness — do not set it here.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * When true, the child's stdout/stderr is piped to the current process
   * for easier debugging. Default: false.
   */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Fixture handle (returned by runFixture / runFixtureTwice)
// ---------------------------------------------------------------------------

export interface FixtureHandle {
  /** The actual TCP port the server bound to (parsed from stdout). */
  port: number;
  /** The underlying child process (use stopFixture() to terminate it). */
  child: ChildProcess;
  /**
   * Thin HTTP client pre-configured to `http://localhost:<port>`.
   * Convenience wrapper — avoids repeating the base URL in every test.
   */
  http: HttpClient;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOpts {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpClient {
  /** Performs a fetch against `http://localhost:<port><path>`. */
  request(path: string, opts?: RequestOpts): Promise<Response>;
  get(path: string, headers?: Record<string, string>): Promise<Response>;
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  put(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  patch(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  del(path: string, headers?: Record<string, string>): Promise<Response>;
}

// ---------------------------------------------------------------------------
// Failure result (runFixtureExpectingFailure)
// ---------------------------------------------------------------------------

export interface FailureResult {
  /** Exit code of the process. null means it was killed by a signal. */
  exitCode: number | null;
  /** Full stdout accumulated before the process ended. */
  stdout: string;
  /** Full stderr accumulated before the process ended. */
  stderr: string;
  /**
   * True when the health-gate timed out instead of the process self-exiting.
   * In that case the harness killed the child and exitCode reflects SIGTERM.
   */
  healthTimedOut: boolean;
}

// ---------------------------------------------------------------------------
// Registry snapshot (.kerith/registry.json)
// ---------------------------------------------------------------------------

/** A single module record, normalized from the registry dict into a flat array entry. */
export interface RegistryRecord {
  id?: string;
  name: string;
  path: string;
  domain?: string;
  hash?: string;
  status: string;
  createdAt?: string;
  lastSeen?: string;
  identifiers?: string[];
  shadowFileId?: string;
}

/** @deprecated Use RegistryRecord instead. Kept for backward compatibility. */
export interface RegistryModule extends RegistryRecord {
  id: string;
  hash: string;
  createdAt: string;
  lastSeen: string;
  identifiers: string[];
  shadowFileId: string;
}

/**
 * Normalized view of a registry file (.kerith/registry.json or domain registry).
 * The `records` array is a flat list of all module entries, built by the reader
 * functions so tests never need to iterate a dict manually.
 */
export interface RegistrySnapshot {
  project?: string;
  version: string;
  lastCheck: string;
  /** Raw modules dict from the JSON file. */
  modules: Record<string, RegistryRecord>;
  domains?: Record<string, unknown>;
  _note?: string;
  /**
   * Flat array of all module records in this snapshot.
   * Built by readRegistrySnapshot() / readDomainRegistrySnapshot().
   * This is the canonical field for test assertions.
   */
  records: RegistryRecord[];
}

// ---------------------------------------------------------------------------
// Manifest (manifest.json co-located with each fixture)
// ---------------------------------------------------------------------------

/** A single HTTP endpoint assertion entry in the manifest. */
export interface ManifestEndpoint {
  /** HTTP method (uppercase). */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path relative to server root (e.g. "/health"). */
  path: string;
  /** Expected HTTP status code. */
  expectedStatus: number;
  /**
   * Expected JSON body (deep-equal assertion).
   * null means the test will only assert the status code, not the body.
   */
  expectedBody: Record<string, unknown> | null;
}

export interface Manifest {
  /**
   * Whether this fixture is expected to boot successfully ("success")
   * or fail on startup ("failure").
   */
  expect: 'success' | 'failure';
  /**
   * The KerithError code expected in stdout/stderr when `expect` is
   * "failure". null for success fixtures.
   */
  errorCode: string | null;
  /**
   * Ordered list of HTTP requests to exercise after the server is up.
   * The test runner iterates this list and asserts status + body for each.
   */
  endpoints: ManifestEndpoint[];
}
