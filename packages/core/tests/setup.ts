import { afterEach } from 'vitest';

afterEach(async () => {
  const { resetGlobalState } = await import('../src/core/state.js');
  resetGlobalState();
});
