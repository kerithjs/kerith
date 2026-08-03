import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSync } from '../src/postgen/sync.js';
import * as cp from 'node:child_process';
import * as prompts from '@clack/prompts';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  log: {
    warn: vi.fn(),
  },
}));

describe('postgen/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockProc(exitCode: number = 0) {
    const proc = new EventEmitter() as any;
    setTimeout(() => proc.emit('close', exitCode), 10);
    return proc;
  }

  it('runs sync-preload and sync-tsconfig for TS projects', async () => {
    const spawnMock = vi.mocked(cp.spawn).mockImplementation(() => createMockProc(0));

    await runSync({ cwd: '/test', ext: 'ts' });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      'npx',
      ['kerith', 'sync-preload'],
      expect.objectContaining({ cwd: '/test' })
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      'npx',
      ['kerith', 'sync-tsconfig'],
      expect.objectContaining({ cwd: '/test' })
    );
  });

  it('runs only sync-preload for JS projects', async () => {
    const spawnMock = vi.mocked(cp.spawn).mockImplementation(() => createMockProc(0));

    await runSync({ cwd: '/test', ext: 'js' });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['kerith', 'sync-preload'],
      expect.objectContaining({ cwd: '/test' })
    );
  });

  it('warns but does not throw on error', async () => {
    vi.mocked(cp.spawn).mockImplementation(() => createMockProc(1)); // Error exit code

    await expect(runSync({ cwd: '/test', ext: 'ts' })).resolves.toBeUndefined();

    expect(prompts.log.warn).toHaveBeenCalled();
  });
});
