import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFixture, stopFixture, readManifest } from '../src/index.js';
import type { FixtureHandle, Manifest } from '../src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runEndpointAssertions(handle: FixtureHandle, manifest: Manifest): Promise<void> {
  for (const endpoint of manifest.endpoints) {
    if (endpoint.pollAfterMs) {
      await new Promise((resolve) => setTimeout(resolve, endpoint.pollAfterMs));
    }

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

describe('03-channels', () => {
  const fixtures = [
    'middleware-channel',
    'alias-channel',
    'schedule-cron'
  ];

  for (const fixtureName of fixtures) {
    describe(fixtureName, () => {
      let handle: FixtureHandle;
      const fixtureDir = resolve(__dirname, `../fixtures/03-channels/${fixtureName}`);

      beforeAll(async () => {
        handle = await runFixture(fixtureDir);
      });

      afterAll(async () => {
        if (handle?.child?.exitCode === null) {
          await stopFixture(handle.child);
        }
      });

      it(`endpoints respond exactly as declared in manifest for ${fixtureName}`, async () => {
        const manifest = readManifest(fixtureDir);
        await runEndpointAssertions(handle, manifest);
      });
    });
  }

  // ── schedule-worker ──────────────────────────────────────────────────────
  describe('schedule-worker', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/03-channels/schedule-worker');

    beforeAll(async () => { handle = await runFixture(fixtureDir); });
    afterAll(async () => { if (handle?.child?.exitCode === null) await stopFixture(handle.child); });

    it('dispatch increments job counter — observable via endpoint', async () => {
      // Trigger dispatch twice
      await handle.http.request('/dispatch', { method: 'GET' });
      await handle.http.request('/dispatch', { method: 'GET' });

      const res = await handle.http.request('/', { method: 'GET' });
      const body = await res.json() as { status: string; jobs: number };
      expect(body.status).toBe('ok');
      expect(body.jobs).toBeGreaterThanOrEqual(2);
    });
  });

  // ── schedule-passthrough-failsoft ────────────────────────────────────────
  describe('schedule-passthrough-failsoft', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/03-channels/schedule-passthrough-failsoft');

    beforeAll(async () => { handle = await runFixture(fixtureDir); });
    afterAll(async () => { if (handle?.child?.exitCode === null) await stopFixture(handle.child); });

    it('server boots successfully despite broken provider (fail-soft)', async () => {
      // The broken provider throws during after-bootstrap execution,
      // but the catch block in createApp.ts swallows it → server stays alive.
      const manifest = readManifest(fixtureDir);
      await runEndpointAssertions(handle, manifest);
    });
  });

  // ── gateway-socketio ──────────────────────────────────────────────────────
  describe('gateway-socketio', () => {
    let handle: FixtureHandle;
    const fixtureDir = resolve(__dirname, '../fixtures/03-channels/gateway-socketio');

    beforeAll(async () => { handle = await runFixture(fixtureDir); });
    afterAll(async () => { if (handle?.child?.exitCode === null) await stopFixture(handle.child); });

    it('health endpoint responds after gateway is attached', async () => {
      const manifest = readManifest(fixtureDir);
      await runEndpointAssertions(handle, manifest);
    });

    it('socket.io bridge responds to ping with echo:pong', async () => {
      const port = handle.port;
      const manifest = readManifest(fixtureDir) as any;
      const cfg = manifest.socketio;

      const socket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        timeout: 5000,
      });

      const response = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.disconnect();
          reject(new Error('socket.io pong timed out after 5s'));
        }, 5000);

        socket.on('connect', () => {
          socket.emit(cfg.event, cfg.payload);
        });

        socket.on(cfg.expectedEvent, (data: string) => {
          clearTimeout(timeout);
          socket.disconnect();
          resolve(data);
        });

        socket.on('connect_error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(response).toBe(cfg.expectedPayload);
    });
  });
});
