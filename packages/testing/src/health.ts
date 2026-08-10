/**
 * health.ts — Health-gate implementation.
 *
 * Implements section 0 of the testing plan:
 *   Poll GET /health with short backoff until the server responds 200
 *   OR the timeout elapses.
 *
 * Returns the port on success so callers can chain into httpClient.
 * Throws a descriptive error on timeout — no specific assertions leak here.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long to wait between poll attempts (ms). */
const POLL_INTERVAL_MS = 100;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Polls `GET http://localhost:<port>/health` until it responds with HTTP 200
 * **or** `timeoutMs` elapses.
 *
 * @param port       - TCP port to poll.
 * @param timeoutMs  - Maximum wait time in milliseconds. Default: 10_000.
 * @returns          - Resolves with `port` when the gate opens.
 * @throws           - If the server never responds in time.
 */
export async function waitForHealth(port: number, timeoutMs = 10_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://localhost:${port}/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        // Short per-attempt timeout so we don't block a whole poll interval on
        // a hanging connection.
        signal: AbortSignal.timeout(POLL_INTERVAL_MS * 5),
      });

      if (res.status === 200) {
        return port;
      }
    } catch {
      // Connection refused, network error, or AbortError — keep polling.
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `[waitForHealth] Server on port ${port} did not respond with HTTP 200 ` +
    `within ${timeoutMs}ms. Bootstrap may have failed or the server crashed.`,
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
