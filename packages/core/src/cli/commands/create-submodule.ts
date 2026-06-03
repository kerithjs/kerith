import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { KerithError } from '../../core/errors.js';
import { generateModuleId, writeShadowFile } from '../../nits/shadow-file.js';
import { SHADOW_FILE_VERSION } from '../../nits/shadow-file.types.js';

export function createSubModuleCommand() {
  return new Command('create-submodule')
    .description('Scaffolds a new Kerith submodule inside an existing module')
    .argument('<name>', 'SubModule name (lowercase, no spaces/special chars)')
    .requiredOption('--module <module>', 'Parent module name (required)')
    .option('--domain <domain>', 'Domain of the parent module (optional, used to resolve the path)')
    .option('--routes', 'Include a routes file')
    .option('--js', 'Force generate JavaScript (.js) files')
    .option('--ts', 'Force generate TypeScript (.ts) files')
    .action((name: string, options: { module: string; domain?: string; routes?: boolean; js?: boolean; ts?: boolean }) => {
      if (!/^[a-z0-9-]+$/.test(name)) {
        throw new KerithError('CLI_ERROR', pc.red(`\nError: Invalid submodule name "${name}". Names must be lowercase and contain only letters, numbers, or hyphens.\n`));
      }

      // Detect language extension
      let ext: string;
      if (options.js) {
        ext = 'js';
      } else if (options.ts) {
        ext = 'ts';
      } else {
        const hasTsConfig = fs.existsSync(path.resolve(process.cwd(), 'tsconfig.json'));
        ext = hasTsConfig ? 'ts' : 'js';
      }

      // Resolve parent module path
      let parentModulePath: string;
      if (options.domain) {
        parentModulePath = path.resolve(process.cwd(), `src/${options.domain}/${options.module}`);
      } else {
        // Try to find the module — first in src/<module>, then in src/modules/<module>
        const inRoot = path.resolve(process.cwd(), `src/${options.module}`);
        const inModules = path.resolve(process.cwd(), `src/modules/${options.module}`);
        if (fs.existsSync(inRoot)) {
          parentModulePath = inRoot;
        } else if (fs.existsSync(inModules)) {
          parentModulePath = inModules;
        } else {
          throw new KerithError('CLI_ERROR', pc.red(`\nError: Parent module "${options.module}" not found. Check the module name and use --domain if the module is inside a domain.\n`));
        }
      }

      if (!fs.existsSync(parentModulePath)) {
        throw new KerithError('CLI_ERROR', pc.red(`\nError: Parent module "${options.module}" does not exist at "${parentModulePath}".\n`));
      }

      const subModulePath = path.join(parentModulePath, 'submodules', name);

      if (fs.existsSync(subModulePath)) {
        throw new KerithError('CLI_ERROR', pc.red(`\nError: The directory "${subModulePath}" already exists. Cannot scaffold submodule here.\n`));
      }

      fs.mkdirSync(subModulePath, { recursive: true });

      const capName = name.charAt(0).toUpperCase() + name.slice(1);

      const files: Record<string, string> = {
        [`index.${ext}`]: generateSubModuleIndex(name, options.module),
        [`${name}.service.${ext}`]: generateSubModuleService(name, capName),
      };

      if (options.routes) {
        files[`${name}.routes.${ext}`] = generateSubModuleRoutes(name);
      }

      for (const [filename, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(subModulePath, filename), content.trim() + '\n', 'utf-8');
      }

      // Write shadow file for stable identity tracking
      const shadowRecord = {
        version: SHADOW_FILE_VERSION,
        id: generateModuleId(),
        name,
        createdAt: new Date().toISOString(),
      };
      writeShadowFile(subModulePath, shadowRecord);

      const relPath = path.relative(process.cwd(), subModulePath).replace(/\\/g, '/');
      console.log(pc.green(`\n✔ SubModule '${name}' created at ${relPath}/`));
      console.log(`  ${pc.gray('.kerith')}`);
      for (const filename of Object.keys(files)) {
        console.log(`  ${pc.cyan(filename)}`);
      }
      console.log(`\nNext step: Import and register the submodule in '${options.module}/index' exports.\n`);
    });
}

function generateSubModuleIndex(name: string, parentModule: string): string {
  return `
import { SubModule } from '@kerith/core'

SubModule('${name}', {
  module: '${parentModule}',
  exports: [],
})
`;
}

function generateSubModuleService(name: string, capName: string): string {
  return `
import { Service } from '@kerith/core'

Service('${capName}Service', { module: '${name}' })

export class ${capName}Service {
  // SubModule business logic here
}
`;
}

function generateSubModuleRoutes(name: string): string {
  return `
import { Controller } from '@kerith/core'
import { Router } from 'express'

Controller('/${name}')

const router = Router()

// Add your submodule routes here
// router.get('/', (req, res) => { ... })

export default router
`;
}
