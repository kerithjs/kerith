import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,      // Integration tests with filesystem and CLI subprocessing can be slow in CI and Windows
    hookTimeout: 30000,
    pool: 'forks',           // True isolation for process.cwd() spies across suites
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'tests/**',
        'dist/**',
        'src/cli/index.ts',   // CLI entry point — no logic to test
      ],
      thresholds: {
        lines: 85,
        branches: 70,
        functions: 90,
        statements: 85,
        'src/nits/shadow-file.ts': {
          branches: 90,
          functions: 100
        }
      }
    }
  },
  resolve: {
    alias: {
      '@modules': path.resolve(import.meta.dirname, 'tests/fixtures/basic-app/src/modules'),
      '@config': path.resolve(import.meta.dirname, 'tests/fixtures/basic-app/src/config'),
      '@middleware': path.resolve(import.meta.dirname, 'tests/fixtures/basic-app/src/middleware')
    },
    extensions: ['.ts', '.js', '.mts', '.mjs', '.json']
  }
});
