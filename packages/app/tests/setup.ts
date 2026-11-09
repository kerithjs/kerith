import { afterEach } from 'vitest';
import { resetGlobalState } from '@kerith/core';

afterEach(() => {
  resetGlobalState();
});
