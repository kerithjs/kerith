import { expect } from 'vitest';
import type { FixtureHandle, Manifest } from './types.js';

export async function runEndpointAssertions(
  handle: FixtureHandle,
  manifest: Manifest,
): Promise<void> {
  for (const endpoint of manifest.endpoints ?? []) {
    if (endpoint.pollAfterMs) {
      await new Promise(r => setTimeout(r, endpoint.pollAfterMs));
    }

    const res = await handle.http.request(endpoint.path, {
      method: endpoint.method,
      ...(endpoint.requestBody !== undefined && { body: endpoint.requestBody }),
    });

    expect(
      res.status,
      `${endpoint.method} ${endpoint.path} — expected status ${endpoint.expectedStatus}, got ${res.status}`,
    ).toBe(endpoint.expectedStatus);

    if (endpoint.expectedBody !== null) {
      const body = await res.json();
      expect(
        body,
        `${endpoint.method} ${endpoint.path} — unexpected body`,
      ).toEqual(endpoint.expectedBody);
    }
  }
}
