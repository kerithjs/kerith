import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { KerithError } from '../../core/errors.js';
import { select, text, confirm, spinner } from '@clack/prompts';
import { generateModuleId } from '../../nits/shadow-file.js';
import { SHADOW_FILE_VERSION } from '../../nits/shadow-file.types.js';
import { createLogger, defaultLogHandler } from '../../core/logger.js';
import { KERITH_VERSION } from '../../bootstrap/version.js';

export function initCommand() {
  return new Command('init')
    .description('Initialize a new Kerith Express project')
    .option('--yes', 'Non-interactive mode, use all defaults')
    .option('--ts', 'Force TypeScript files (default)')
    .option('--js', 'Force JavaScript files')
    .option('--port <number>', 'Port number (default: 3000)', '3000')
    .option('--prefix <path>', 'Path prefix for routes (default: empty)', '')
    .option('--skip-install', 'Generate files but skip npm install')
    .action(async (options: { yes?: boolean; ts?: boolean; js?: boolean; port?: string; prefix?: string; skipInstall?: boolean }) => {
      const cwd = process.cwd();
      
      validateDirectoryGuard(cwd, !!options.yes);

      // Determine language, port, and prefix
      let ext: string;
      let port: string;
      let prefix: string;

      if (options.yes) {
        // Non-interactive mode: use flags or defaults
        if (options.js) {
          ext = 'js';
        } else if (options.ts) {
          ext = 'ts';
        } else {
          ext = 'ts';
        }
        const rawPort = options.port || '3000';
        const numPort = Number(rawPort);
        if (isNaN(numPort) || numPort < 1 || numPort > 65535) {
          throw new KerithError('CLI_ERROR', pc.red(`\nError: Invalid port "${rawPort}". Port must be a number between 1 and 65535.\n`));
        }
        port = rawPort;
        prefix = options.prefix || '';
      } else {
        // Interactive mode: prompt user
        const language = await select({
          message: 'Which language do you want to use?',
          options: [
            { value: 'ts', label: 'TypeScript' },
            { value: 'js', label: 'JavaScript' },
          ],
          initialValue: 'ts',
        });
        ext = language as string;

        const portInput = await text({
          message: 'Server port?',
          defaultValue: '3000',
          validate: (value) => {
            const num = Number(value);
            if (isNaN(num) || num < 1 || num > 65535) {
              return 'Please enter a valid port (1-65535)';
            }
            return undefined;
          },
        });
        port = portInput as string;

        const prefixInput = await text({
          message: 'Route prefix? (e.g. /api/v1)',
          defaultValue: '',
        });
        prefix = prefixInput as string;
      }

      // Project name from current directory
      const projectName = path.basename(cwd);

      // Show summary and ask for confirmation
      if (!options.yes) {
        console.log(pc.cyan(`\nProject summary:\n`));
        console.log(`  ${pc.gray('Name:')} ${pc.white(projectName)}`);
        console.log(`  ${pc.gray('Language:')} ${pc.white(ext === 'ts' ? 'TypeScript' : 'JavaScript')}`);
        console.log(`  ${pc.gray('Port:')} ${pc.white(port)}`);
        console.log(`  ${pc.gray('Prefix:')} ${pc.white(prefix || '(none)')}`);
        console.log();

        const shouldProceed = await confirm({
          message: 'Create project?',
          initialValue: true,
        });

        if (!shouldProceed) {
          console.log(pc.yellow('\nCancelled by user.\n'));
          process.exit(0);
        }
      }

      // Generate project structure
      const projectFiles = generateProjectStructure(projectName, ext, port, prefix, KERITH_VERSION);

      // Create directories and files
      for (const [filePath, content] of Object.entries(projectFiles)) {
        const fullPath = path.join(cwd, filePath);
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, content.trim() + '\n', 'utf-8');
      }

      console.log(pc.green(`\nKerith Express project initialized successfully!\n`));
      for (const filePath of Object.keys(projectFiles)) {
        console.log(`  ${pc.gray(filePath)}`);
      }

      if (!options.skipInstall) {
        const installSpinner = spinner();
        installSpinner.start('Installing dependencies...');
        
        const { spawn } = await import('node:child_process');
        
        await new Promise<void>((resolve, reject) => {
          const installProcess = spawn('npm', ['install'], { 
            stdio: 'pipe', 
            shell: true 
          });

          let errOutput = '';
          installProcess.stderr?.on('data', (data) => {
            errOutput += data.toString();
          });

          installProcess.on('close', (code) => {
            if (code !== 0) {
              installSpinner.stop('Installation failed');
              console.error(pc.red(`\nERROR  npm install failed with exit code ${code}\n`));
              if (errOutput) console.error(pc.gray(errOutput));
              console.log(pc.yellow('Project files have been created. To complete the setup:\n'));
              console.log(pc.cyan('  npm install\n'));
              reject(new Error(`npm install failed with exit code ${code}`));
            } else {
              installSpinner.stop('Dependencies installed successfully');
              console.log(pc.green(`\nDependencies installed successfully!\n`));
              resolve();
            }
          });

          installProcess.on('error', (err) => {
            installSpinner.stop('Installation failed');
            console.error(pc.red(`\nERROR  Failed to run npm install: ${err.message}\n`));
            console.log(pc.yellow('Project files have been created. To complete the setup:\n'));
            console.log(pc.cyan('  npm install\n'));
            reject(err);
          });
        });
      } else {
        console.log(pc.yellow(`\nWARN  Skipped npm install. Run the following command manually:\n`));
        console.log(pc.cyan('  npm install\n'));
      }

      // Sync preload and tsconfig
      const logger = createLogger(defaultLogHandler, 'info', 'init');
      console.log(pc.yellow(`\nSyncing preload and tsconfig...\n`));
      
      try {
        const { runSyncPreload } = await import('./sync-preload.js');
        await runSyncPreload(logger, true);
        console.log(pc.green('Preload synced successfully'));
      } catch {
        console.log(pc.yellow('WARN  Preload sync failed (this is normal if dependencies are not installed yet)'));
      }

      if (ext === 'ts') {
        try {
          const { runSyncTsconfig } = await import('./sync-tsconfig.js');
          await runSyncTsconfig(logger, 'tsconfig.json', true);
          console.log(pc.green('tsconfig synced successfully'));
        } catch {
          console.log(pc.yellow('WARN  tsconfig sync failed (this is normal if dependencies are not installed yet)'));
        }
      }

      console.log(pc.cyan(`\nNext steps:\n`));
      console.log(pc.yellow(`  (You are already in the project directory)`));
      if (!options.skipInstall) {
        console.log(`  ${pc.gray('1.')} npm run dev`);
      } else {
        console.log(`  ${pc.gray('1.')} npm install`);
        console.log(`  ${pc.gray('2.')} npm run dev`);
      }
      console.log();
    });
}

export function validateDirectoryGuard(cwd: string, isYes: boolean): void {
  // Mode A guard: Check if package.json exists
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    console.log(pc.yellow(`\nWARN  A package.json already exists in this directory.`));
    console.log(pc.gray(`   Use kerith init on an existing project (Mode B) — coming soon.\n`));
    process.exit(0);
  }

  // Check if directory is empty
  const rawFiles = fs.readdirSync(cwd);
  const ignoredFiles = new Set(['.git', '.gitignore', '.editorconfig', '.DS_Store', '.env', '.env.local', '.kerith']);
  const files = rawFiles.filter(file => !ignoredFiles.has(file));
  const hasFiles = files.length > 0;

  if (hasFiles) {
    if (!isYes) {
      console.log(pc.yellow(`\nWARN  The directory is not empty but does not have package.json.`));
      console.log(pc.gray(`   This might contain user files we don't want to overwrite.\n`));
      
      throw new KerithError('CLI_ERROR', pc.red(`\nError: To proceed in a non-empty directory, use --yes to confirm.\n`));
    } else {
      console.log(pc.yellow(`\nWARN  Warning: The directory is not empty.`));
      console.log(pc.yellow(`   Found files: ${files.join(', ')}\n`));
      console.log(pc.red(`   WARN  These files may be overwritten without further confirmation.\n`));
    }
  }
}

export function generateProjectStructure(projectName: string, ext: string, port: string, prefix: string, kerithVersion: string): Record<string, string> {
  const files: Record<string, string> = {};
  
  files['package.json'] = generatePackageJson(projectName, ext, kerithVersion);
  files[`kerith.config.${ext}`] = generateKerithConfig(ext, prefix);
  files[`src/server.${ext}`] = generateServer(ext, port);
  
  // Generate health module
  const healthName = 'health';
  files[`src/modules/${healthName}/index.${ext}`] = generateModuleIndex(healthName);
  files[`src/modules/${healthName}/${healthName}.routes.${ext}`] = generateHealthRoutes();
  
  const healthShadowRecord = {
    version: SHADOW_FILE_VERSION,
    id: generateModuleId(),
    name: healthName,
    createdAt: new Date().toISOString(),
  };
  files[`src/modules/${healthName}/.kerith`] = JSON.stringify(healthShadowRecord, null, 2);

  // Generate home module
  const homeName = 'home';
  files[`src/modules/${homeName}/index.${ext}`] = generateModuleIndex(homeName);
  files[`src/modules/${homeName}/${homeName}.routes.${ext}`] = generateHomeRoutes();
  
  const homeShadowRecord = {
    version: SHADOW_FILE_VERSION,
    id: generateModuleId(),
    name: homeName,
    createdAt: new Date().toISOString(),
  };
  files[`src/modules/${homeName}/.kerith`] = JSON.stringify(homeShadowRecord, null, 2);
  
  files['src/modules/.gitkeep'] = '';
  files['src/shared/.gitkeep'] = '';
  files['.gitignore'] = generateGitignore();
  files['README.md'] = generateReadme(projectName);

  if (ext === 'ts') {
    files['tsconfig.json'] = generateTsConfig();
    files['tsconfig.kerith.json'] = generateTsConfigKerithBase();
  }

  return files;
}

function generatePackageJson(projectName: string, ext: string, kerithVersion: string): string {
  const isTs = ext === 'ts';
  
  return JSON.stringify({
    name: projectName,
    version: '0.1.0',
    type: 'module',
    private: true,
    engines: {
      node: '>=24.0.0',
    },
    scripts: {
      dev: isTs 
        ? 'kerith dev --watch --clear --runtime tsx src/server.ts'
        : 'kerith dev --watch --clear src/server.js',
      ...(isTs ? {
        build: 'tsc',
        start: 'NODE_ENV=production node dist/server.js'
      } : {
        start: 'NODE_ENV=production node src/server.js'
      }),
      setup: 'kerith sync-preload && kerith sync-tsconfig',
      check: 'kerith check',
    },
    dependencies: {
      '@kerith/core': `^${kerithVersion}`,
      express: '^5.0.0',
    },
    ...(isTs ? {
      devDependencies: {
        '@types/express': '^5.0.0',
        '@types/node': '^20.0.0',
        tsx: '^4.0.0',
        typescript: '^5.4.5',
      },
    } : {}),
  }, null, 2);
}

function generateKerithConfig(ext: string, prefix: string): string {
  const safePrefix = JSON.stringify(prefix);
  if (ext === 'ts') {
    return `import { defineConfig } from '@kerith/core'

export default defineConfig({
  origin: 'src',
  prefix: ${safePrefix},
})
`;
  }
  return `/** @type {import('@kerith/core').KerithConfig} */
export default {
  origin: 'src',
  prefix: ${safePrefix},
}
`;
}

function generateServer(ext: string, port: string): string {
  return `import express from 'express'
import { createApp, KerithError, useLogger, useHttpLogger } from '@kerith/core'

const log = useLogger('app')
const httpLogger = useHttpLogger({ ignore: ['/health'] })

const app = express()
app.use(express.json())
app.use(httpLogger.requests())

try {
  const kerith = await createApp(app)
  
  if (!kerith.runtime.preloaderActive) {
    log.warn('Pre-loader not detected. Run: npm run setup')
  }
  
  log.info(\`Mounted \${kerith.routes.length} route(s)\`)
  
  const port = ${port}
  const server = app.listen(port, () => {
    log.info(\`Server running on http://localhost:\${port}\`)
  })
  
  kerith.listen(server, {
    onShutdown: async () => {
      log.info('Cleaning up resources...')
      // await db.disconnect()
    }
  })
  
  // Error handler — must be the last middleware in the pipeline
  app.use(httpLogger.errors())
} catch (err) {
  if (err instanceof KerithError) {
    log.error(\`[\${err.code}] \${err.message}\`)
    if (err.details) log.error(err.details)
    process.exit(1)
  }
  log.error(err instanceof Error ? err.message : String(err))
  throw err
}
`;
}

function generateModuleIndex(name: string): string {
  return `
import { Module } from '@kerith/core'

Module('${name}', {
  imports: [],
  exports: [],
})
`;
}

function generateHealthRoutes(): string {
  return `import { Controller } from '@kerith/core'
import { Router } from 'express'

Controller('/health')

const router = Router()

router.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Hello from Kerith!' })
})

export default router
`;
}

function generateHomeRoutes(): string {
  return `import { Controller } from '@kerith/core'
import { Router } from 'express'

Controller('/')

const router = Router()

router.get('/', (_req, res) => {
  res.send('Hello World! Welcome to Kerith Express')
})

export default router
`;
}

function generateTsConfigKerithBase(): string {
  return JSON.stringify({
    // Base file that tsconfig.json always extends.
    // Kept minimal on purpose — user-facing compiler options live in tsconfig.json.
    compilerOptions: {},
  }, null, 2);
}

function generateTsConfig(): string {
  return JSON.stringify({
    extends: './tsconfig.kerith.json',
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      verbatimModuleSyntax: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true,
      paths: {},
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2);
}

function generateGitignore(): string {
  return `node_modules
dist
.env
.env.local
.kerith/bootstrap-cache.json
`;
}

function generateReadme(projectName: string): string {
  return `# ${projectName}

## Getting Started

To run the development server:
\`\`\`bash
npm run dev
\`\`\`

## Architecture

This project is built using [Kerith](https://github.com/kerithjs/kerith).

- \`kerith.config.ts\`: Central configuration for the framework. It defines where modules are located (\`origin\`) and custom route prefixes.
- \`.kerith/registry.json\`: This file tracks all your modules and their identifiers. **It must be checked into Git** to ensure consistency across environments.
- \`.kerith/preload.js\`: This is automatically generated and must also be checked into Git. It enables fast startup and ESM alias resolution.
`;
}
