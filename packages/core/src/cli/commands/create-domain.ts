import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { KerithError } from '../../core/errors.js';

export function createDomainCommand() {
  return new Command('create-domain')
    .description('Scaffolds a new Kerith domain')
    .argument('<name>', 'Domain name (lowercase, no spaces/special chars)')
    .option('--modules <names...>', 'Modules to scaffold inside the domain')
    .option('--shared', 'Include a _shared module folder within the domain')
    .option('--js', 'Force generate JavaScript (.js) files')
    .option('--ts', 'Force generate TypeScript (.ts) files')
    .action(async (name: string, options: { modules?: string[]; shared?: boolean; js?: boolean; ts?: boolean }) => {
      if (!/^[a-z0-9-]+$/.test(name)) {
        throw new KerithError('CLI_ERROR', pc.red(`\nError: Invalid domain name "${name}". Domain names must be lowercase and contain only letters, numbers, or hyphens.\n`));
      }

      // Detect language extension
      let ext: string;
      if (options.js) {
        ext = 'js';
      } else if (options.ts) {
        ext = 'ts';
      } else {
        // Auto-detect typescript project
        const hasTsConfig = fs.existsSync(path.resolve(process.cwd(), 'tsconfig.json'));
        ext = hasTsConfig ? 'ts' : 'js';
      }

      const domainPath = path.resolve(process.cwd(), `src/${name}`);

      if (fs.existsSync(domainPath)) {
        throw new KerithError('CLI_ERROR', pc.red(`\nError: The directory "${domainPath}" already exists. Cannot scaffold domain here.\n`));
      }

      fs.mkdirSync(domainPath, { recursive: true });

      const indexContent = `
import { Domain } from '@kerith/core'

Domain('${name}')
`;
      fs.writeFileSync(path.join(domainPath, `index.${ext}`), indexContent.trim() + '\n', 'utf-8');

      console.log(pc.green(`\n✔ Domain '${name}' created at src/${name}/`));
      console.log(`  ${pc.cyan(`index.${ext}`)}`);

      if (options.shared) {
        const sharedPath = path.join(domainPath, '_shared');
        fs.mkdirSync(sharedPath, { recursive: true });
        
        const sharedIndexContent = `// @${name}/shared — internal shared resources of domain ${name}\n// Export from here everything that modules of this domain need to share.\n`;
        fs.writeFileSync(path.join(sharedPath, `index.${ext}`), sharedIndexContent, 'utf-8');
        console.log(`  ${pc.cyan(`_shared/index.${ext}`)}`);
      }

      if (options.modules && options.modules.length > 0) {
        console.log(`\n${pc.gray(`Scaffolding modules within domain '${name}'...`)}`);
        
        // Use create-module functionality for each provided module
        // We can just invoke the module creation logic indirectly by creating an instance of the action or duplicating the core logic.
        // Actually, importing the action from createModuleCommand is tricky because we don't have direct access.
        // But since we just need the scaffold, we could execute the command or duplicate logic.
        // It's cleaner to spawn a child process or just run the module logic.
        
        const { spawnSync } = await import('node:child_process');
        
        for (const modName of options.modules) {
          const args = ['create-module', modName, '--domain', name];
          if (options.js) args.push('--js');
          if (options.ts) args.push('--ts');
          
          const result = spawnSync(process.argv[0], [process.argv[1], ...args], { stdio: 'inherit', env: process.env });
          if (result.error) {
            console.error(pc.red(`Failed to run create-module for ${modName}`));
          }
        }
      }

      console.log(`\nNext step: Start building your domain modules inside src/${name}/`);
    });
}
