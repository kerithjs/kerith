import { Command } from 'commander';
import path from 'node:path';
import pc from 'picocolors';
import fg from 'fast-glob';
import { deleteShadowFile } from '../../nits/shadow-file.js';
import { SHADOW_FILE_NAME } from '../../nits/shadow-file.types.js';
import { loadConfig } from '../../core/config.js';
import * as readline from 'node:readline';

// ─── Confirmation prompt ───────────────────────────────────────────────────────

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin as any, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function cleanCommand(): Command {
  const clean = new Command('clean');

  clean
    .description('Removes generated Kerith artifacts from the project')
    .option(
      '--shadow-files',
      'Delete all .kerith identity files from module directories. IDs will be regenerated on next bootstrap.',
      false
    )
    .option(
      '--cache',
      'Delete the bootstrap cache file (.kerith/bootstrap-cache.json)',
      false
    )
    .action(async (options: { shadowFiles?: boolean; cache?: boolean }) => {
      const cwd = process.cwd();

      if (!options.shadowFiles && !options.cache) {
        console.log(pc.yellow('\nNo clean target specified. Available options:\n'));
        console.log(`  ${pc.cyan('--shadow-files')}   Delete all .kerith module identity files`);
        console.log(`  ${pc.cyan('--cache')}          Delete the bootstrap cache file\n`);
        console.log(`Run ${pc.white('kerith clean --help')} for usage.\n`);
        return;
      }

      // ── --cache ──────────────────────────────────────────────────────────────
      if (options.cache) {
        const { CacheManager } = await import('../../cache/bootstrap-cache.js');
        CacheManager.invalidate();
        console.log(pc.green('✔ Bootstrap cache cleared.\n'));
      }

      // ── --shadow-files ───────────────────────────────────────────────────────
      if (options.shadowFiles) {
        let config: Awaited<ReturnType<typeof loadConfig>>;
        try {
          config = await loadConfig();
        } catch {
          // Fallback if config can't be read
          config = { origin: 'src' } as any;
        }

        const scanRoot = (config as any).origin ?? (config as any).modules?.replace(/\/\*$/, '') ?? 'src';
        const shadowPattern = `${scanRoot}/**/${SHADOW_FILE_NAME}`;
        const found = await fg(shadowPattern, { cwd, absolute: true, dot: true });

        if (found.length === 0) {
          console.log(pc.green('\nNo .kerith identity files found. Nothing to clean.\n'));
          return;
        }

        console.log(pc.yellow(`\nFound ${found.length} .kerith identity file(s):\n`));
        for (const f of found) {
          console.log(`  ${pc.gray(path.relative(cwd, f))}`);
        }

        console.log('');
        const ok = await confirm(
          pc.red('⚠  This will delete all module identity files. ') +
          'IDs will be regenerated on next bootstrap. Continue? (y/N) '
        );

        if (!ok) {
          console.log(pc.gray('\nAborted. No files were deleted.\n'));
          return;
        }

        let deleted = 0;
        let failed = 0;

        for (const filePath of found) {
          const dir = path.dirname(filePath);
          try {
            deleteShadowFile(dir);
            deleted++;
          } catch {
            console.warn(pc.yellow(`  ⚠  Could not delete: ${path.relative(cwd, filePath)}`));
            failed++;
          }
        }

        console.log('');
        if (failed === 0) {
          console.log(pc.green(`✔ Deleted ${deleted} .kerith identity file(s).\n`));
        } else {
          console.log(pc.yellow(`Deleted ${deleted} file(s), ${failed} could not be removed.\n`));
        }

        console.log(pc.gray('Run your application or `kerith check` to regenerate identities.\n'));
      }
    });

  return clean;
}
