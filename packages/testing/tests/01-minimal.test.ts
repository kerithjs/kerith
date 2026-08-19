/**
 * 01-minimal.test.ts
 *
 * Exercises minimal boot for both the `core` and `app` templates.
 *
 * Contract: each fixture's `manifest.json` declares what endpoints to hit and
 * what status/body to expect, so this file contains zero magic strings.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFixture, stopFixture, readManifest } from '../src/index.js';
import type { FixtureHandle } from '../src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helper: drive a started fixture through its manifest endpoints
// ---------------------------------------------------------------------------

async function runEndpointAssertions(handle: FixtureHandle, fixtureDir: string): Promise<void> {
  const manifest = readManifest(fixtureDir);

  for (const endpoint of manifest.endpoints || []) {
    const res = await handle.http.request(endpoint.path, { method: endpoint.method });

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

// ---------------------------------------------------------------------------
// core template
// ---------------------------------------------------------------------------

describe('01-minimal', () => {
  describe('core template', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/01-minimal-core');

    beforeAll(async () => {
      handle = await runFixture(fixtureDir);
    });

    afterAll(async () => {
      if (handle) {
        await stopFixture(handle.child);
      }
    });

    it('boots and all manifest endpoints respond as declared', async () => {
      await runEndpointAssertions(handle, fixtureDir);
    });

    it('shuts down cleanly and executes onShutdown hook', async () => {
      let output = '';
      handle.child.stdout?.on('data', (chunk) => {
        output += chunk.toString();
      });

      // Await close so we are guaranteed to have drained all stdout before asserting.
      const closed = new Promise<void>((resolve) => handle.child.once('close', resolve));
      await stopFixture(handle.child);
      await closed;

      expect(output).toContain('Cleaning up resources...');
    });
  });

  // ---------------------------------------------------------------------------
  // app template
  // ---------------------------------------------------------------------------

  describe('app template', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/01-minimal-app');

    beforeAll(async () => {
      handle = await runFixture(fixtureDir);
    });

    afterAll(async () => {
      if (handle) {
        await stopFixture(handle.child);
      }
    });

    it('boots and all manifest endpoints respond as declared', async () => {
      await runEndpointAssertions(handle, fixtureDir);
    });

    it('shuts down cleanly and executes onShutdown hook', async () => {
      let output = '';
      handle.child.stdout?.on('data', (chunk) => {
        output += chunk.toString();
      });

      // Await close so we are guaranteed to have drained all stdout before asserting.
      const closed = new Promise<void>((resolve) => handle.child.once('close', resolve));
      await stopFixture(handle.child);
      await closed;

      expect(output).toContain('Cleaning up resources...');
    });
  });
});
