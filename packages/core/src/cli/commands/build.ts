import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../../core/config.js';
import { createLogger, defaultLogHandler } from '../../core/logger.js';
import { generateAliasTable, writeAliasTableFile } from '../../bootstrap/alias-table.js';
import { runSyncPreload } from './sync-preload.js';

export function buildCommand(): Command {
  const build = new Command('build');

  build
    .description('Build the Kerith project, generate alias table (.kerith/alias-table.json) and compile')
    .option('--no-tsc', 'Skip running tsc compilation', false)
    .option('--silent', 'Suppress log output', false)
    .action(async (options) => {
      const cwd = process.cwd();
      const logger = createLogger(defaultLogHandler, options.silent ? 'warn' : 'info', 'build');
      const config = await loadConfig();

      const originPath = config.origin
        ? path.resolve(cwd, config.origin)
        : path.resolve(cwd, 'src');

      // 1. Generate .kerith/alias-table.json (7.2 D9)
      if (!options.silent) {
        logger.info('Generating static alias table (.kerith/alias-table.json)...', { _module: 'alias' });
      }

      const tableFile = await generateAliasTable({
        cwd,
        originPath,
        warn: (msg) => logger.warn(msg, { _module: 'alias' }),
      });
      writeAliasTableFile(cwd, tableFile);

      if (!options.silent) {
        const count = Object.keys(tableFile.entries).length;
        logger.info(`Generated alias table with ${count} alias(es) at ${pc.cyan('.kerith/alias-table.json')}`, { _module: 'alias' });
      }

      // 2. Generate .kerith/preload.js
      try {
        await runSyncPreload(logger, options.silent);
      } catch (err: any) {
        logger.warn(`Pre-loader generation failed: ${err.message}`, { _module: 'alias' });
      }

      // 3. Optional tsc compilation
      if (options.tsc !== false && fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
        if (!options.silent) {
          logger.info('Running TypeScript compilation (tsc)...', { _module: 'build' });
        }
        const isWindows = process.platform === 'win32';
        const tscBin = isWindows ? 'tsc.cmd' : 'tsc';
        const result = spawnSync(tscBin, [], { cwd, stdio: 'inherit', shell: isWindows });
        if (result.status !== 0 && result.status !== null) {
          process.exit(result.status);
        }
      }

      if (!options.silent) {
        logger.info(pc.green('✔ Build completed successfully.'), { _module: 'build' });
      }
    });

  return build;
}

