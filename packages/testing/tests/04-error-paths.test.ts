import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFixture, stopFixture, readManifest, runFixtureExpectingFailure } from '../src/index.js';
import type { FixtureHandle } from '../src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('04-error-paths', () => {

  // ── binding-bind-failfast ────────────────────────────────────────────────
  describe('binding-bind-failfast', () => {
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/binding-bind-failfast');

    it('throws KerithError attributing the failure to the binding provider', async () => {
      // The child process should crash because of the failing binding
      const failure = await runFixtureExpectingFailure(fixtureDir);
      
      expect(failure.exitCode).toBe(1);
      
      // KerithError: BINDING_EXECUTION_FAILED
      // Binding provider "failing-binding" failed during bind() execution
      expect(failure.stdout).toContain('[BINDING_EXECUTION_FAILED]');
      expect(failure.stdout).toContain('failing-binding');
      expect(failure.stdout).toContain('This is a raw engine error');
    });
  });

  // ── schedule-provider-partial-failure ────────────────────────────────────
  describe('schedule-provider-partial-failure', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/schedule-provider-partial-failure');

    beforeAll(async () => {
      handle = await runFixture(fixtureDir);
    });

    afterAll(async () => {
      if (handle?.child?.exitCode === null) {
        await stopFixture(handle.child);
      }
    });

    it('good provider runs despite broken provider throwing error', async () => {
      const manifest = readManifest(fixtureDir);
      const endpoint = manifest.endpoints[0];
      
      const res = await handle.http.request(endpoint.path, { method: endpoint.method });
      expect(res.status).toBe(endpoint.expectedStatus);
      
      const body = await res.json();
      expect(body).toEqual(endpoint.expectedBody);
    });
  });

});
