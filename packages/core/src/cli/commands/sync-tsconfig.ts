import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'comment-json';
import { loadConfig } from '../../core/config.js';
import { generatePathAliases } from '../lib/tsconfig-generator.js';

interface TsConfig {
  extends?: string | string[];
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
}

export async function runSyncTsconfig(logger: any, tsconfigPath: string = 'tsconfig.json', silent: boolean = false) {
    try {
        const cwd = process.cwd();
        const configPath = path.resolve(cwd, tsconfigPath);

        // Defensive: create the base file if it doesn't exist so tsc never fails
        // with TS5083 on projects created before this fix or with broken setups.
        const kerithBasePath = path.join(path.dirname(configPath), 'tsconfig.kerith.json');
        if (!fs.existsSync(kerithBasePath)) {
          fs.writeFileSync(kerithBasePath, JSON.stringify({ compilerOptions: {} }, null, 2) + '\n', 'utf8');
        }

        if (!fs.existsSync(configPath)) {
            if (!silent) {
                logger.error(`Could not find ${tsconfigPath} at ${configPath}`, { _module: 'alias' });
                throw new Error(`Config not found at ${configPath}`);
            }
            return;
        }

        const config = await loadConfig();
        const pathsObj = await generatePathAliases(config, cwd, logger);

        const rawContent = await fs.promises.readFile(configPath, 'utf8');
        const tsconfig = parse(rawContent) as unknown as TsConfig;

        // Auto-repair extends
        let hasExtends = false;
        if (tsconfig.extends !== undefined) {
            if (Array.isArray(tsconfig.extends)) {
                if (tsconfig.extends.includes('./tsconfig.kerith.json')) {
                    hasExtends = true;
                } else {
                    tsconfig.extends.push('./tsconfig.kerith.json');
                    hasExtends = true;
                }
            } else if (typeof tsconfig.extends === 'string') {
                if (tsconfig.extends === './tsconfig.kerith.json') {
                    hasExtends = true;
                } else {
                    tsconfig.extends = [tsconfig.extends, './tsconfig.kerith.json'];
                    hasExtends = true;
                }
            }
        }
        if (!hasExtends) {
            tsconfig.extends = './tsconfig.kerith.json';
        }

        if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
        const compilerOptions = tsconfig.compilerOptions;
        if (!compilerOptions.paths) compilerOptions.paths = {};
        const paths = compilerOptions.paths;

        const currentKeys = new Set(Object.keys(pathsObj));

        for (const key of Object.keys(paths)) {
            if (currentKeys.has(key)) continue;

            const val = paths[key];
            const isKerithModule = key.startsWith('@modules/');
            const isStaleFolderAlias = 
                key.startsWith('@') && 
                Array.isArray(val) && 
                val.length === 1 && 
                typeof val[0] === 'string' && 
                (val[0].startsWith('./') || val[0].startsWith('../')) && 
                ((key.endsWith('/*') && val[0].endsWith('/*')) || (paths[`${key}/*`] !== undefined));

            if (isKerithModule || isStaleFolderAlias) {
                delete paths[key];
            }
        }

        Object.assign(paths, pathsObj);

        const sortedPaths: Record<string, string[]> = {};
        Object.keys(paths).sort().forEach(k => sortedPaths[k] = paths[k]);
        
        compilerOptions.paths = sortedPaths;

        fs.writeFileSync(configPath, stringify(tsconfig, null, 2) + '\n', 'utf8');

        const moduleCount = Object.keys(pathsObj).filter(k => k.startsWith('@modules/')).length;
        const aliasCount = Object.keys(pathsObj).length - moduleCount;

        if (!silent) {
            logger.info(`✔ tsconfig.json updated — ${moduleCount} module(s), ${aliasCount} folder alias(es)`, { _module: 'alias' });
            // For detailed paths, we use debug level to keep it clean, but could log them if not silent
            logger.debug(`Paths updated: ${Object.keys(pathsObj).length}`, { _module: 'alias' });
        }
    } catch (err: any) {
        logger.error(`Error synchronizing tsconfig: ${err.message}`, { _module: 'alias' });
        throw err;
    }
}

export function syncTsconfigCommand() {
  return new Command('sync-tsconfig')
    .description('Syncs Kerith aliases into tsconfig.json paths array for IDE support')
    .option('--tsconfig <path>', 'Path to tsconfig.json', 'tsconfig.json')
    .option('--silent', 'Suppress output', false)
    .action(async (options: { tsconfig: string, silent: boolean }) => {
        const { createLogger, defaultLogHandler } = await import('../../core/logger.js');
        const logger = createLogger(defaultLogHandler, 'info', 'alias');
        try {
            await runSyncTsconfig(logger, options.tsconfig, options.silent);
        } catch (_err: any) {
            process.exit(1);
        }
    });
}
