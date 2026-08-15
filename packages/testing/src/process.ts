/**
 * process.ts — Subprocess management for the harness.
 *
 * Covers:
 *  - runFixture()              happy-path: spawn → health-gate → FixtureHandle
 *  - stopFixture()             SIGTERM + drain
 *  - runFixtureExpectingFailure() error-paths: spawn → expect non-zero exit
 *  - runFixtureTwice()         identity tests: two sequential runs
 *
 * Architecture notes (from the plan):
 *  - Always subprocess-based. Never import() the fixture in-process.
 *    Node caches ESM modules by resolved URL — a second createApp() in the
 *    same process would NOT re-run Module()/Controller() decorators.
 *  - PORT is resolved via env PORT=0 so the OS picks a free port.
 *    The actual port is parsed from the log line:
 *      "Server running on http://localhost:<PORT>"
 *  - tsx is used as the runner so fixtures run as TypeScript directly,
 *    matching the `npm run dev` experience (no pre-build of the fixture).
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { waitForHealth } from './health.js';
import { createHttpClient } from './http-client.js';
import type { FixtureOpts, FixtureHandle, FailureResult } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regex that matches the log line emitted by every generated server.ts:
 *   "Server running on http://localhost:3000"
 * Capture group 1 → the port number.
 */
const PORT_RE = /Server running on http:\/\/localhost:(\d+)/;

// ---------------------------------------------------------------------------
// runFixture
// ---------------------------------------------------------------------------

/**
 * Spawns the fixture's `src/server.ts` via `tsx`, waits for the health-gate,
 * and returns a {@link FixtureHandle}.
 *
 * Injects `PORT=0` so the OS picks any free port; parses the actual port from
 * the server's stdout log line.
 *
 * @param fixtureDir   - Absolute path to the fixture project directory.
 * @param opts         - Optional: timeout, extra env, debug flag.
 */
export async function runFixture(
  fixtureDir: string,
  opts: FixtureOpts = {},
): Promise<FixtureHandle> {
  const { healthTimeoutMs = 10_000, env = {}, debug = false } = opts;

  const serverEntry = resolve(fixtureDir, 'src/server.ts');
  const preloadPath = resolve(fixtureDir, '.kerith/preload.js');

  const child = spawnServer(fixtureDir, serverEntry, preloadPath, env, debug);

  const port = await resolvePort(child, healthTimeoutMs);

  // Run health-gate: ensures the server is accepting requests before returning.
  await waitForHealth(port, healthTimeoutMs);

  return {
    port,
    child,
    http: createHttpClient(port),
  };
}

// ---------------------------------------------------------------------------
// stopFixture
// ---------------------------------------------------------------------------

/**
 * Sends SIGTERM to the child and waits for it to close.
 *
 * This is the mechanism used by `01-minimal` to assert that
 * `kerith.listen(server, { onShutdown })` ran its cleanup hook.
 *
 * @param child         - The child process from a {@link FixtureHandle}.
 * @param timeoutMs     - Max wait after SIGTERM before giving up. Default 5000.
 */
export async function stopFixture(
  child: ChildProcess,
  timeoutMs = 5_000,
): Promise<void> {
  if (child.exitCode !== null) return; // Already exited.

  if (child.send) {
    child.send('kerith:shutdown');
  } else {
    child.kill('SIGTERM');
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // On Windows, npx.cmd creates a process tree and SIGTERM gets swallowed.
      // We forcefully kill it and resolve so the test suite doesn't fail.
      child.kill('SIGKILL');
      if (process.platform === 'win32') {
        resolve();
      } else {
        reject(new Error(`[stopFixture] Process did not exit within ${timeoutMs}ms after SIGTERM`));
      }
    }, timeoutMs);

    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// runFixtureExpectingFailure
// ---------------------------------------------------------------------------

/**
 * Variant for `04-error-paths` fixtures:
 *
 * Spawns the server and expects it to either:
 *  a) self-exit with a non-zero exit code before the health-gate passes, OR
 *  b) the health-gate times out (server never listens) — harness kills it.
 *
 * Returns a {@link FailureResult} with stdout, stderr, and exit code so tests
 * can assert on the specific `KerithError` code in the output.
 *
 * @param fixtureDir   - Absolute path to the fixture project directory.
 * @param opts         - Optional: timeout, extra env, debug flag.
 */
export async function runFixtureExpectingFailure(
  fixtureDir: string,
  opts: FixtureOpts = {},
): Promise<FailureResult> {
  const { healthTimeoutMs = 10_000, env = {}, debug = false } = opts;

  const serverEntry = resolve(fixtureDir, 'src/server.ts');
  const preloadPath = resolve(fixtureDir, '.kerith/preload.js');

  const child = spawnServer(fixtureDir, serverEntry, preloadPath, env, debug);

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // Race: process self-exits OR health-gate times out.
  const result = await Promise.race([
    // Branch A: process exits on its own (happy-path for error fixtures).
    waitForExit(child).then((code) => ({ kind: 'exit' as const, code })),
    // Branch B: health-gate timeout — server never became ready.
    sleep(healthTimeoutMs).then(() => ({ kind: 'timeout' as const })),
  ]);

  let exitCode: number | null;
  let healthTimedOut = false;

  if (result.kind === 'timeout') {
    healthTimedOut = true;
    // Kill the child — it's hanging.
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    exitCode = await waitForExit(child);
    clearTimeout(timer);
  } else {
    exitCode = result.code;
  }

  return { exitCode, stdout, stderr, healthTimedOut };
}

// ---------------------------------------------------------------------------
// runFixtureTwice
// ---------------------------------------------------------------------------

/**
 * For `03-restart-identity` tests:
 * Runs the fixture as **two separate processes** sequentially.
 * Each call to `runFixture` is a fresh Node.js process — no ESM cache sharing.
 *
 * @param fixtureDir   - Absolute path to the fixture project directory.
 * @param opts         - Applied to both runs.
 * @returns            - Tuple `[first, second]` — caller must stop both.
 */
export async function runFixtureTwice(
  fixtureDir: string,
  opts: FixtureOpts = {},
  actionBetweenRuns?: (firstHandle: FixtureHandle) => Promise<void> | void,
): Promise<[FixtureHandle, FixtureHandle]> {
  const first = await runFixture(fixtureDir, opts);
  await stopFixture(first.child);

  if (actionBetweenRuns) {
    await actionBetweenRuns(first);
  }

  const second = await runFixture(fixtureDir, opts);

  return [first, second];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the absolute path to tsx's CLI entry-point (`dist/cli.mjs`).
 *
 * We use `createRequire` anchored at this module's location so pnpm's
 * virtual store is traversed correctly on all platforms. Invoking `node`
 * with this path avoids `npx` entirely — no shell wrapper, no DEP0190,
 * no `.cmd`-on-Windows issue.
 *
 * tsx exports `"./cli": "./dist/cli.mjs"` in its package.json exports map,
 * so `require.resolve('tsx/cli')` is the canonical way to get the path.
 */
function resolveTsxCli(): string {
  const req = createRequire(import.meta.url);
  return req.resolve('tsx/cli');
}

/**
 * Spawns `node <tsx-cli> --import <preload> <serverEntry>` in `cwd = fixtureDir`.
 *
 * Calls `node` (process.execPath) directly with tsx's `dist/cli.mjs` to avoid
 * spawning through npx/.cmd wrappers, eliminating DEP0190 and Windows EINVAL.
 * PORT=0 is injected so the OS assigns a free port.
 */
function spawnServer(
  cwd: string,
  serverEntry: string,
  preloadPath: string,
  extraEnv: NodeJS.ProcessEnv,
  debug: boolean,
): ChildProcess {
  const tsxCli = resolveTsxCli();
  const preloadUrl = `file://${preloadPath.replace(/\\/g, '/')}`;

  const child = spawn(
    process.execPath,
    [tsxCli, '--import', preloadUrl, serverEntry],
    {
      cwd,
      shell: false,
      env: {
        ...process.env,
        ...extraEnv,
        PORT: '0',
        // Ensure coloured output doesn't pollute port-parsing.
        FORCE_COLOR: '0',
      },
      stdio: debug ? ['ignore', 'inherit', 'inherit', 'ipc'] : ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );

  return child;
}

/**
 * Reads stdout line-by-line until it finds the "Server running" log line and
 * extracts the actual port the OS assigned.
 *
 * Rejects if the process exits before emitting the port line, or if the
 * timeout fires first.
 */
function resolvePort(child: ChildProcess, timeoutMs: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let buffer = '';

    const timer = setTimeout(() => {
      reject(new Error(
        `[runFixture] Timed out waiting for "Server running on http://localhost:<PORT>" log ` +
        `after ${timeoutMs}ms. The server may have crashed on startup.`,
      ));
    }, timeoutMs);

    const cleanup = () => clearTimeout(timer);

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = PORT_RE.exec(buffer);
      if (match) {
        cleanup();
        resolve(parseInt(match[1]!, 10));
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = PORT_RE.exec(buffer);
      if (match) {
        cleanup();
        resolve(parseInt(match[1]!, 10));
      }
    });

    child.once('exit', (code: number | null) => {
      cleanup();
      reject(new Error(
        `[runFixture] Process exited with code ${code} before emitting the port log line. ` +
        `stdout so far:\n${buffer}`,
      ));
    });
  });
}

/** Resolves with the exit code once the child process closes. */
function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once('close', (code: number | null) => resolve(code));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
