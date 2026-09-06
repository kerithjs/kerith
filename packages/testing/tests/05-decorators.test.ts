import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFixture, stopFixture, readManifest, runEndpointAssertions } from '../src/index.js';
import type { FixtureHandle } from '../src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('05-decorators', () => {
  describe('validate', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/05-decorators/validate');

    beforeAll(async () => {
      handle = await runFixture(fixtureDir);
    });

    afterAll(async () => {
      if (handle?.child?.exitCode === null) {
        await stopFixture(handle.child);
      }
    });

    it('boots and Validate() passes valid payload (201) and rejects invalid payload (400)', async () => {
      const manifest = readManifest(fixtureDir);
      try {
        await runEndpointAssertions(handle, manifest);
      } catch (e) {
        console.error('SERVER LOGS:', handle.getLogs());
        throw e;
      }
    });
  });

  describe('basic', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/05-decorators/basic');

    beforeAll(async () => {
      handle = await runFixture(fixtureDir);
    });

    afterAll(async () => {
      if (handle?.child?.exitCode === null) {
        await stopFixture(handle.child);
      }
    });

    it('boots and all manifest endpoints respond as declared (validating both decorator and mixed mode)', async () => {
      const manifest = readManifest(fixtureDir);
      await runEndpointAssertions(handle, manifest);
    });
  });
});
