import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { KerithError } from '../../core/errors.js';
import { select, text, confirm, spinner } from '@clack/prompts';
import { generateModuleId, writeShadowFile } from '../../nits/shadow-file.js';
import { SHADOW_FILE_VERSION } from '../../nits/shadow-file.types.js';
import { createLogger, defaultLogHandler } from '../../core/logger.js';

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
      
      // Mode A guard: Check if package.json exists
      if (fs.existsSync(path.join(cwd, 'package.json'))) {
        console.log(pc.yellow(`\n⚠️  A package.json already exists in this directory.`));
        console.log(pc.gray(`   Use kerith init on an existing project (Mode B) — coming soon.\n`));
        process.exit(0);
      }

      // Check if directory is empty
      const files = fs.readdirSync(cwd);
      const hasFiles = files.length > 0;

      if (hasFiles && !options.yes) {
        console.log(pc.yellow(`\n⚠️  The directory is not empty but does not have package.json.`));
        console.log(pc.gray(`   This might contain user files we don't want to overwrite.\n`));
        
        // In interactive mode, we would use @clack/prompts here
        // For now, we'll require --yes to proceed
        throw new KerithError('CLI_ERROR', pc.red(`\nError: To proceed in a non-empty directory, use --yes to confirm.\n`));
      }

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
        port = options.port || '3000';
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
        console.log(pc.cyan(`\n📋 Project summary:\n`));
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
          console.log(pc.yellow('\n❌ Cancelled by user.\n'));
          process.exit(0);
        }
      }

      // Generate project structure
      const projectFiles = generateProjectStructure(projectName, ext, port, prefix);

      // Create directories and files
      for (const [filePath, content] of Object.entries(projectFiles)) {
        const fullPath = path.join(cwd, filePath);
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, content.trim() + '\n', 'utf-8');
      }

      console.log(pc.green(`\n✔ Kerith Express project initialized successfully!\n`));
      console.log(`  ${pc.gray('package.json')}`);
      console.log(`  ${pc.gray('kerith.config.' + ext)}`);
      console.log(`  ${pc.gray('src/server.' + ext)}`);
      console.log(`  ${pc.gray('src/modules/health/.kerith')}`);
      console.log(`  ${pc.gray('src/modules/health/index.' + ext)}`);
      console.log(`  ${pc.gray('src/modules/health/health.routes.' + ext)}`);
      console.log(`  ${pc.gray('src/modules/.gitkeep')}`);
      console.log(`  ${pc.gray('src/domains/.gitkeep')}`);
      console.log(`  ${pc.gray('src/shared/.gitkeep')}`);

      // Sync preload and tsconfig
      const logger = createLogger(defaultLogHandler, 'info', 'init');
      console.log(pc.yellow(`\n🔧 Syncing preload and tsconfig...\n`));
      
      try {
        const { runSyncPreload } = await import('./sync-preload.js');
        await runSyncPreload(logger, true);
        console.log(pc.green('✅ Preload synced successfully'));
      } catch (err: any) {
        console.log(pc.yellow('⚠️  Preload sync failed (this is normal if dependencies are not installed yet)'));
      }

      if (ext === 'ts') {
        try {
          const { runSyncTsconfig } = await import('./sync-tsconfig.js');
          await runSyncTsconfig(logger, 'tsconfig.json', true);
          console.log(pc.green('✅ tsconfig synced successfully'));
        } catch (err: any) {
          console.log(pc.yellow('⚠️  tsconfig sync failed (this is normal if dependencies are not installed yet)'));
        }
      }

      console.log();

      if (!options.skipInstall) {
        const installSpinner = spinner();
        installSpinner.start('Installing dependencies...');
        
        const { spawn } = await import('node:child_process');
        
        await new Promise<void>((resolve, reject) => {
          const installProcess = spawn('npm', ['install', 'express', '@kerith/core'], { 
            stdio: 'pipe', 
            shell: true 
          });

          installProcess.on('close', (code) => {
            if (code !== 0) {
              installSpinner.stop('Installation failed');
              console.error(pc.red(`\n❌ npm install failed with exit code ${code}\n`));
              console.log(pc.yellow('Project files have been created. To complete the setup:\n'));
              console.log(pc.cyan('  npm install express @kerith/core\n'));
              reject(new Error(`npm install failed with exit code ${code}`));
            } else {
              installSpinner.stop('Dependencies installed successfully');
              console.log(pc.green(`\n✅ Dependencies installed successfully!\n`));
              resolve();
            }
          });

          installProcess.on('error', (err) => {
            installSpinner.stop('Installation failed');
            console.error(pc.red(`\n❌ Failed to run npm install: ${err.message}\n`));
            console.log(pc.yellow('Project files have been created. To complete the setup:\n'));
            console.log(pc.cyan('  npm install express @kerith/core\n'));
            reject(err);
          });
        });
      } else {
        console.log(pc.yellow(`\n⚠️  Skipped npm install. Run the following command manually:\n`));
        console.log(pc.cyan('  npm install express @kerith/core\n'));
      }

      console.log(pc.cyan(`\n🚀 Next steps:\n`));
      console.log(`  ${pc.gray('1.')} cd ${path.basename(cwd)}`);
      if (!options.skipInstall) {
        console.log(`  ${pc.gray('2.')} npm run dev`);
      } else {
        console.log(`  ${pc.gray('2.')} npm install`);
        console.log(`  ${pc.gray('3.')} npm run dev`);
      }
      console.log();
    });
}

function generateProjectStructure(projectName: string, ext: string, port: string, prefix: string): Record<string, string> {
  const files: Record<string, string> = {};
  
  files['package.json'] = generatePackageJson(projectName, ext);
  files[`kerith.config.${ext}`] = generateKerithConfig(ext, port, prefix);
  files[`src/server.${ext}`] = generateServer(ext, port);
  
  // Generate health module
  const moduleName = 'health';
  files[`src/modules/${moduleName}/index.${ext}`] = generateModuleIndex(moduleName);
  files[`src/modules/${moduleName}/${moduleName}.routes.${ext}`] = generateModuleRoutes(moduleName);
  
  // Write shadow file for health module
  const shadowRecord = {
    version: SHADOW_FILE_VERSION,
    id: generateModuleId(),
    name: moduleName,
    createdAt: new Date().toISOString(),
  };
  files[`src/modules/${moduleName}/.kerith`] = JSON.stringify(shadowRecord, null, 2);
  
  files['src/modules/.gitkeep'] = '';
  files['src/domains/.gitkeep'] = '';
  files['src/shared/.gitkeep'] = '';

  if (ext === 'ts') {
    files['tsconfig.json'] = generateTsConfig();
  }

  return files;
}

function generatePackageJson(projectName: string, ext: string): string {
  const isTs = ext === 'ts';
  
  return JSON.stringify({
    name: projectName,
    version: '0.1.0',
    type: 'module',
    private: true,
    engines: {
      node: '>=20.6.0',
    },
    scripts: {
      dev: isTs 
        ? 'kerith dev --watch --clear --runtime tsx src/server.ts'
        : 'kerith dev --watch --clear src/server.js',
      setup: 'kerith sync-preload && kerith sync-tsconfig',
      check: 'kerith check',
    },
    dependencies: {
      '@kerith/core': '^2.0.0',
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

function generateKerithConfig(ext: string, port: string, prefix: string): string {
  if (ext === 'ts') {
    return `import { defineConfig } from '@kerith/core'

export default defineConfig({
  origin: 'src',
  server: {
    port: ${port},
    prefix: '${prefix}',
  },
})
`;
  }
  return `/** @type {import('@kerith/core').KerithConfig} */
export default {
  origin: 'src',
  server: {
    port: ${port},
    prefix: '${prefix}',
  },
}
`;
}

function generateServer(ext: string, port: string): string {
  if (ext === 'ts') {
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
  
  const server = app.listen(${port}, () => {
    log.info('Server running on http://localhost:${port}')
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
  
  const server = app.listen(${port}, () => {
    log.info('Server running on http://localhost:${port}')
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

function generateModuleRoutes(name: string): string {
  return `
import { Controller } from '@kerith/core'
import { Router } from 'express'

Controller('/${name}')

const router = Router()

// Add your routes here
// router.get('/', (req, res) => { ... })

export default router
`;
}

function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: './dist',
      rootDir: './src',
      strict: true,
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
