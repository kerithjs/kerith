#!/usr/bin/env node
/**
 * create-kerith — CLI entrypoint
 *
 * Responsibilities (and ONLY these):
 *  1. Parse CLI flags via commander.
 *  2. Run interactive prompts (prompts.ts).
 *  3. Delegate generation to generators/*.
 *  4. Hand the resulting file map to fs-writer.ts.
 *  5. Trigger post-gen hooks (postgen/sync.ts).
 */

import { program } from 'commander';
import path from 'node:path';
import * as p from '@clack/prompts';
import { runPrompts, type CliFlags } from './prompts.js';
import { buildCoreTemplate } from './generators/core-template.js';
import { buildAppTemplate } from './generators/app-template.js';
import { writeProject } from './fs-writer.js';
import { runSync } from './postgen/sync.js';

async function main() {
  // 1. Parse CLI flags
  program
    .name('create-kerith')
    .description('CLI to generate Kerith projects')
    .argument('[project-name]', 'Name of the project')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option('-t, --template <type>', 'Template to use (core|app)')
    .option('-l, --language <lang>', 'Language (ts|js)')
    .option('-p, --port <number>', 'Port for the server')
    .option('--prefix <prefix>', 'Route prefix')
    .option('--no-install', 'Skip npm install')
    .option('-o, --out-dir <dir>', 'Output directory');

  program.parse(process.argv);
  const options = program.opts();
  const args = program.args;

  const flags: CliFlags = {
    yes: options.yes,
    projectName: args[0] || options.projectName,
    template: options.template as 'core' | 'app',
    language: options.language as 'ts' | 'js',
    port: options.port ? parseInt(options.port, 10) : undefined,
    prefix: options.prefix,
    noInstall: options.install === false,
    outDir: options.outDir,
  };

  // 2. Run interactive prompts
  const choices = await runPrompts(flags);

  // When the user didn't supply --out-dir, default is '.' which means
  // "create a sub-folder named after the project inside cwd".
  const absoluteOutDir = choices.outDir === '.'
    ? path.resolve(process.cwd(), choices.projectName)
    : path.resolve(process.cwd(), choices.outDir);

  // 3. Delegate to generators
  let fileMap = buildCoreTemplate({
    outDir: absoluteOutDir,
    projectName: choices.projectName,
    language: choices.language,
    port: choices.port,
    routePrefix: choices.routePrefix,
    yes: !!options.yes,
  });

  if (choices.template === 'app') {
    fileMap = buildAppTemplate(fileMap, {
      projectName: choices.projectName,
      language: choices.language,
      channels: choices.channels,
      redis: choices.redis,
      socketio: choices.socketio,
    });
  }

  // 4. Write files and run npm install
  await writeProject({
    outDir: absoluteOutDir,
    files: fileMap,
    install: choices.installDeps,
    yes: !!options.yes,
  });

  // 5. Post-gen hooks
  if (choices.installDeps) {
    await runSync({
      cwd: absoluteOutDir,
      ext: choices.language,
    });
  }

  // 6. Outro
  const outDirName = choices.outDir === '.' ? choices.projectName : choices.outDir;
  let nextSteps = `cd ${outDirName}\n`;
  if (!choices.installDeps) {
    nextSteps += `npm install\n`;
    nextSteps += `npx kerith sync-preload\n`;
    if (choices.language === 'ts') {
      nextSteps += `npx kerith sync-tsconfig\n`;
    }
  }
  nextSteps += `npm run dev`;

  p.note(nextSteps, 'Next steps');
  p.outro(`Project ${choices.projectName} created successfully!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
