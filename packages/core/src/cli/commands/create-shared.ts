import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { KerithError } from '../../core/errors.js';

export function createSharedCommand() {
  return new Command('create-shared')
    .description('Creates a _shared folder inside an existing domain, or the global src/shared/ folder')
    .option('--domain <name>', 'Domain to add _shared to (creates src/{domain}/_shared/)')
    .option('--global', 'Create the global src/shared/ folder instead')
    .option('--js', 'Force generate JavaScript (.js) files')
    .option('--ts', 'Force generate TypeScript (.ts) files')
    .action(async (options: { domain?: string; global?: boolean; js?: boolean; ts?: boolean }) => {
      const hasFlag = options.domain || options.global;
      if (!hasFlag) {
        throw new KerithError(
          'CLI_ERROR',
          pc.red('\nError: Specify --domain <name> to add _shared to a domain, or --global for the project-wide shared folder.\n'),
        );
      }

      if (options.domain && options.global) {
        throw new KerithError(
          'CLI_ERROR',
          pc.red('\nError: --domain and --global are mutually exclusive.\n'),
        );
      }

      // Auto-detect extension if not forced
      let ext: string;
      if (options.js) {
        ext = 'js';
      } else if (options.ts) {
        ext = 'ts';
      } else {
        const hasTsConfig = fs.existsSync(path.resolve(process.cwd(), 'tsconfig.json'));
        ext = hasTsConfig ? 'ts' : 'js';
      }

      // ── Global shared ─────────────────────────────────────────────────────────
      if (options.global) {
        const sharedDir  = path.resolve(process.cwd(), 'src/shared');
        const indexPath  = path.join(sharedDir, `index.${ext}`);

        if (fs.existsSync(sharedDir)) {
          throw new KerithError(
            'CLI_ERROR',
            pc.red(`\nError: Global shared folder already exists at src/shared/.\n`),
          );
        }

        fs.mkdirSync(sharedDir, { recursive: true });

        const content =
          `// @shared — recursos compartidos globales del proyecto\n` +
          `// Exportá desde aquí todo lo que los módulos necesiten compartir entre dominios.\n`;
        fs.writeFileSync(indexPath, content, 'utf-8');

        console.log(pc.green(`\n✔ Global shared created at src/shared/`));
        console.log(`  ${pc.cyan(`index.${ext}`)}`);
        console.log(`\nNext step: import with ${pc.cyan('@shared')} or ${pc.cyan('@shared/<subpath>')}`);
        return;
      }

      // ── Domain-scoped shared ─────────────────────────────────────────────────
      const domainName = options.domain!;

      if (!/^[a-z0-9-]+$/.test(domainName)) {
        throw new KerithError(
          'CLI_ERROR',
          pc.red(`\nError: Invalid domain name "${domainName}". Domain names must be lowercase and contain only letters, numbers, or hyphens.\n`),
        );
      }

      const domainDir  = path.resolve(process.cwd(), `src/${domainName}`);
      const sharedDir  = path.join(domainDir, '_shared');
      const indexPath  = path.join(sharedDir, `index.${ext}`);

      if (!fs.existsSync(domainDir)) {
        throw new KerithError(
          'CLI_ERROR',
          pc.red(
            `\nError: Domain "${domainName}" does not exist at src/${domainName}/.\n` +
            `Create it first with: ${pc.bold(`kerith create-domain ${domainName}`)}\n`,
          ),
        );
      }

      if (fs.existsSync(sharedDir)) {
        throw new KerithError(
          'CLI_ERROR',
          pc.red(`\nError: _shared already exists at src/${domainName}/_shared/.\n`),
        );
      }

      fs.mkdirSync(sharedDir, { recursive: true });

      const content =
        `// @${domainName}/shared — recursos compartidos internos del dominio ${domainName}\n` +
        `// Exportá desde aquí todo lo que los módulos de este dominio necesiten compartir.\n`;
      fs.writeFileSync(indexPath, content, 'utf-8');

      console.log(pc.green(`\n✔ Domain shared created at src/${domainName}/_shared/`));
      console.log(`  ${pc.cyan(`index.${ext}`)}`);
      console.log(`\nNext step: import with ${pc.cyan(`@${domainName}/shared`)} or ${pc.cyan(`@${domainName}/shared/<subpath>`)}`);
    });
}
