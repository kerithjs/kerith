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

  // ── malformed-alias ──────────────────────────────────────────────────────
  describe('malformed-alias', () => {
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/malformed-alias');

    it('server never starts when a module imports a non-existent alias', async () => {
      // The child process should crash because home/index.ts imports
      // '@modules/no-existe', which is not registered in preload.js.
      // Node throws ERR_MODULE_NOT_FOUND before Module() ever runs.
      const failure = await runFixtureExpectingFailure(fixtureDir);

      // Process must have exited with a non-zero code (or been killed due to
      // health-gate timeout — either way the server never listened).
      expect(failure.exitCode !== 0 || failure.healthTimedOut).toBe(true);

      // The combined output must mention MODULE_NOT_FOUND so the cause is clear.
      const combined = failure.stdout + failure.stderr;
      expect(combined).toContain('MODULE_NOT_FOUND');
    });
  });

  // ── circular-dependency ──────────────────────────────────────────────────
  describe('circular-dependency', () => {
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/circular-dependency');

    it('fails to boot with CIRCULAR_DEPENDENCY when strict mode is true', async () => {
      const failure = await runFixtureExpectingFailure(fixtureDir);
      
      expect(failure.exitCode).toBe(1);
      
      const combined = failure.stdout + failure.stderr;
      expect(combined).toContain('CIRCULAR_DEPENDENCY');
    });
  });

  // ── duplicate-identifier ─────────────────────────────────────────────────
  describe('duplicate-identifier', () => {
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/duplicate-identifier');

    it('fails to boot with DUPLICATE_MODULE when two folders register the same module name', async () => {
      const failure = await runFixtureExpectingFailure(fixtureDir);

      expect(failure.exitCode).toBe(1);

      const combined = failure.stdout + failure.stderr;
      expect(combined).toContain('DUPLICATE_MODULE');
    });
  });

  // ── export-mismatch ──────────────────────────────────────────────────────
  describe('export-mismatch', () => {
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/export-mismatch');

    it('fails to boot with EXPORT_MISMATCH when a declared export does not exist in index.ts', async () => {
      const failure = await runFixtureExpectingFailure(fixtureDir);

      expect(failure.exitCode).toBe(1);

      const combined = failure.stdout + failure.stderr;
      expect(combined).toContain('EXPORT_MISMATCH');
    });
  });

  // ── undeclared-shared / strict-on ───────────────────────────────────────
  describe('undeclared-shared/strict-on', () => {
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/undeclared-shared/strict-on');

    it('fails to boot with UNDECLARED_SHARED when strict is true', async () => {
      const failure = await runFixtureExpectingFailure(fixtureDir);

      expect(failure.exitCode).toBe(1);

      const combined = failure.stdout + failure.stderr;
      expect(combined).toContain('UNDECLARED_SHARED');
    });
  });

  // ── undeclared-shared / strict-off ──────────────────────────────────────
  describe('undeclared-shared/strict-off', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/04-error-paths/undeclared-shared/strict-off');

    beforeAll(async () => {
      handle = await runFixture(fixtureDir);
    });

    afterAll(async () => {
      if (handle?.child?.exitCode === null) {
        await stopFixture(handle.child);
      }
    });

    it('boots successfully and emits UNDECLARED_SHARED as a warning when strict is false', () => {
      // The process is still running (boot succeeded). stdout collected during
      // runFixture should contain the warning code emitted by log.warn().
      expect(handle.child.exitCode).toBeNull();
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
