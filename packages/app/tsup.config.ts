import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'], // solo ESM — mismo formato que core e identifiers
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  external: ['@kerith/core', '@kerith/identifiers', 'express', 'bullmq', 'node-cron'],
})
