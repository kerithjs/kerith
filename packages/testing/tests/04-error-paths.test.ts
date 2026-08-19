import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFixture, stopFixture, readManifest, runFixtureExpectingFailure } from '../src/index.js';
import type { FixtureHandle } from '../src/index.js';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const errorPathsDir = resolve(__dirname, '../fixtures/04-error-paths');

// Helper to find all manifests recursively (max depth to avoid node_modules)
function findManifests(dir: string, depth = 0): string[] {
  if (depth > 5) return []; // sanity limit
  const manifests: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'src' || entry.name.startsWith('.')) continue;
      manifests.push(...findManifests(join(dir, entry.name), depth + 1));
    } else if (entry.isFile() && entry.name === 'manifest.json') {
      manifests.push(join(dir, entry.name));
    }
  }
  return manifests;
}

const allManifests = findManifests(errorPathsDir);

describe('04-error-paths', () => {
  for (const manifestPath of allManifests) {
    const fixtureDir = dirname(manifestPath);
    const fixtureName = relative(errorPathsDir, fixtureDir).replace(/\\/g, '/');
    const manifest = readManifest(fixtureDir);

    describe(fixtureName, () => {
      if (manifest.expect === 'failure') {
        it(`fails to boot with ${manifest.errorCode}`, async () => {
          const failure = await runFixtureExpectingFailure(fixtureDir);
          
          expect(failure.exitCode).not.toBe(0);
          
          if (manifest.errorCode) {
            const combined = failure.stdout + failure.stderr;
            expect(combined).toContain(manifest.errorCode);
          }
        });
      } else {
        let handle: FixtureHandle;

        beforeAll(async () => {
          handle = await runFixture(fixtureDir);
        });

        afterAll(async () => {
          if (handle?.child?.exitCode === null) {
            await stopFixture(handle.child);
          }
        });

        it(`boots successfully`, () => {
          expect(handle.child.exitCode).toBeNull();
        });

        if (manifest.warnCode) {
          it(`emits ${manifest.warnCode} warning in stdout`, () => {
            expect(handle.getLogs()).toContain(manifest.warnCode);
          });
        }

        if (manifest.endpoints && manifest.endpoints.length > 0) {
          it('serves expected endpoints', async () => {
            for (const endpoint of manifest.endpoints!) {
              const res = await handle.http.request(endpoint.path, { method: endpoint.method });
              expect(res.status).toBe(endpoint.expectedStatus);
              if (endpoint.expectedBody) {
                const body = await res.json();
                expect(body).toEqual(endpoint.expectedBody);
              }
            }
          });
        }
      }
    });
  }
});
