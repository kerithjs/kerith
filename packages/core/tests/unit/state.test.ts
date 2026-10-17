import { describe, it, expect, beforeEach } from 'vitest';
import { runGuard, markBootstrapped, releaseBootstrap, resetBootstrapGuard } from '../../src/bootstrap/steps/step-00-guard.js';
import { resetGlobalState } from '../../src/core/state.js';
import { KerithError } from '../../src/core/errors.js';

describe('Global State & Bootstrap Guard State Machine', () => {
  beforeEach(() => {
    resetBootstrapGuard();
  });

  it('runGuard() marks booting and blocks a second runGuard() in the same process', () => {
    runGuard(undefined);

    expect(() => runGuard(undefined)).toThrowError(KerithError);
    expect(() => runGuard(undefined)).toThrowError(
      /createApp\(\) was called more than once in the same process/
    );
  });

  it('markBootstrapped() transitions booting -> booted, and second boot remains blocked', () => {
    runGuard(undefined);
    markBootstrapped();

    expect(() => runGuard(undefined)).toThrowError(KerithError);
    expect(() => runGuard(undefined)).toThrowError(
      /createApp\(\) was called more than once in the same process/
    );
  });

  it('resetGlobalState() resets guard state to idle and permits a subsequent boot in the same process', () => {
    // 1. First boot cycle
    runGuard(undefined);
    markBootstrapped();

    // 2. Second boot is blocked
    expect(() => runGuard(undefined)).toThrowError(
      /createApp\(\) was called more than once in the same process/
    );

    // 3. resetGlobalState() resets bootstrapState to idle
    resetGlobalState();

    // 4. Subsequent boot succeeds without throwing
    expect(() => runGuard(undefined)).not.toThrow();
  });

  it('releaseBootstrap() releases booting back to idle on failure', () => {
    runGuard(undefined);
    releaseBootstrap();

    // State is back to idle, so another boot can run
    expect(() => runGuard(undefined)).not.toThrow();
  });

  it('markBootstrapped() is guarded and only transitions when booting', () => {
    // Calling markBootstrapped when idle does not advance state to booted
    resetBootstrapGuard();
    markBootstrapped();

    // Still idle, so runGuard succeeds
    expect(() => runGuard(undefined)).not.toThrow();
  });
});
