import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: [
    '@kerith/core',
    '@kerith/app',
    '@kerith/identifiers',
    '@clack/prompts',
    'commander',
    'picocolors',
  ],
});
