import { defineConfig } from 'tsup';

export default defineConfig([
  // Runs first — cleans dist/ and builds the main entry + extension together
  // so that dist/extension/index.d.ts is guaranteed to exist before Turbo
  // marks this task complete and @kerith/app:build starts.
  {
    entry: {
      index: 'src/index.ts',
      'extension/index': 'src/extension/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node20',
    external: ['pino', '@clack/prompts'],
  },
  {
    entry: ['src/cli/index.ts', 'src/cli/api.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist/cli',
    sourcemap: true,
    target: 'node20',
    external: ['pino', '@clack/prompts'],
  },
  {
    entry: ['src/preload/preload-hook.ts'],
    format: ['esm'],
    outDir: 'dist/preload',
    target: 'node20',
    minify: false,
    sourcemap: true,
    external: ['pino', '@clack/prompts'],
  },
]);
