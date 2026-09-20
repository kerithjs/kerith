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
 * 
 * TODO(future): Extract the core generation logic (steps 3-5) into an exported `generate(options)` 
 * function so `create-kerith` can be invoked programmatically without spawning a child process.
 */

import { program } from 'commander';
import path from 'node:path';
import * as p from '@clack/prompts';
import { runPrompts, validatePort, validateChannels, type CliFlags } from './prompts.js';
import type { ChannelType } from './generators/channel-stubs.js';
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
    .option('--channels <list>', 'Comma-separated channels: alias,middleware,cron,worker,gateway')
    .option('--redis', 'Include Redis (ioredis) stub for worker/cron')
    .option('--socketio', 'Include Socket.io support for gateway')
    .option('--no-install', 'Skip npm install')
    .option('-o, --out-dir <dir>', 'Output directory');

  program.parse(process.argv);
  const options = program.opts();
  const args = program.args;

  // Validate --port early, before runPrompts, so --yes --port abc fails fast.
  if (options.port !== undefined) {
    const portError = validatePort(String(options.port));
    if (portError) {
      program.error(`Invalid --port "${options.port}": ${portError}`);
    }
  }

  // Validate --template early.
  const VALID_TEMPLATES = ['core', 'app'] as const;
  if (options.template !== undefined && !VALID_TEMPLATES.includes(options.template)) {
    program.error(`Invalid --template "${options.template}": must be "core" or "app"`);
  }

  // Validate --language early.
  const VALID_LANGUAGES = ['ts', 'js'] as const;
  if (options.language !== undefined && !VALID_LANGUAGES.includes(options.language)) {
    program.error(`Invalid --language "${options.language}": must be "ts" or "js"`);
  }

  let channelsFlag: ChannelType[] | undefined;
  if (options.channels !== undefined) {
    const result = validateChannels(String(options.channels), options.template);
    if (!result.valid) {
      program.error(result.error);
    }
    channelsFlag = result.channels;
  }

  const flags: CliFlags = {
    yes: options.yes,
    projectName: args[0] || options.projectName,
    template: options.template as 'core' | 'app',
    language: options.language as 'ts' | 'js',
    channels: channelsFlag,
    redis: options.redis,
    socketio: options.socketio,
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
  let syncSuccess = true;
  if (choices.installDeps) {
    syncSuccess = await runSync({
      cwd: absoluteOutDir,
      ext: choices.language,
    });
  }

  // 6. Outro
  const outDirName = choices.outDir === '.' ? choices.projectName : choices.outDir;
  let nextSteps = `cd ${outDirName}\n`;
  if (!choices.installDeps || !syncSuccess) {
    if (!choices.installDeps) {
      nextSteps += `npm install\n`;
    }
    nextSteps += `npx kerith sync-preload\n`;
    if (choices.language === 'ts') {
      nextSteps += `npx kerith sync-tsconfig\n`;
    }
  }
  nextSteps += `npm run dev`;

  p.note(nextSteps, 'Next steps');
  
  if (!syncSuccess) {
    p.outro(`Project ${choices.projectName} created, but configuration sync failed.`);
    process.exit(1);
  } else {
    p.outro(`Project ${choices.projectName} created successfully!`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
