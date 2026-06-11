import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { KerithConfig } from '../../config/kerith-config.types.js';
import { scanFromConfig } from '../../bootstrap/scanner.js';

export async function generatePathAliases(config: KerithConfig, cwd: string, logger?: any): Promise<Record<string, string[]>> {
  const pathsObj: Record<string, string[]> = {};

  // 1. Register base modules generated paths
  let moduleDirs: string[] = [];
  if (config.origin) {
    const globPattern = `${config.origin.replace(/\\/g, '/')}/**/index.{ts,js,mts,mjs}`;
    const indexFiles = await fg(globPattern, { absolute: true, cwd });
    moduleDirs = Array.from(new Set(indexFiles.map((f) => path.dirname(f))));
  } else if (config.modules) {
    const globPattern = config.modules.replace(/\\/g, '/');
    moduleDirs = await fg(globPattern, {
      onlyDirectories: true,
      absolute: true,
      cwd
    });
  }

    moduleDirs.sort();

    for (const dirPath of moduleDirs) {
      const modName = path.basename(dirPath);
      const aliasKey = `@modules/${modName}`;
      
      let indexPath = path.join(dirPath, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(dirPath, 'index.js');
      }

      let relativeDirPath = path.relative(cwd, dirPath).replace(/\\/g, '/');
      if (!relativeDirPath.startsWith('./') && !relativeDirPath.startsWith('../')) {
        relativeDirPath = './' + relativeDirPath;
      }
      
      if (fs.existsSync(indexPath)) {
        let relativeIndexPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
        if (!relativeIndexPath.startsWith('./') && !relativeIndexPath.startsWith('../')) {
          relativeIndexPath = './' + relativeIndexPath;
        }
        pathsObj[aliasKey] = [relativeIndexPath];
      }
      
      // Always provide directory wildcard
      pathsObj[`${aliasKey}/*`] = [`${relativeDirPath}/*`];
    }

    // 2. Detect domains using scanner (Fase 7)
    let packageJson: any = null;
    try {
      packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    } catch (_e) {
      // Ignorar si no hay package.json
    }

    const allDependencies = new Set([
      ...Object.keys(packageJson?.dependencies || {}),
      ...Object.keys(packageJson?.devDependencies || {}),
      ...Object.keys(packageJson?.peerDependencies || {})
    ]);

    const scanResult = await scanFromConfig(config, cwd);
    for (const domain of scanResult.domains) {
      const aliasKey = `@${domain.name}`;

      if (allDependencies.has(aliasKey)) {
        if (logger) {
          logger.warn(`[Kerith] Alias "${aliasKey}" conflicts with npm package. Consider renaming your domain.`, { _module: 'alias' });
        } else {
          console.warn(`[Kerith] Alias "${aliasKey}" conflicts with npm package. Consider renaming your domain.`);
        }
      }

      let indexPath = path.join(domain.dirPath, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(domain.dirPath, 'index.js');
      }

      let relativeDirPath = path.relative(cwd, domain.dirPath).replace(/\\/g, '/');
      if (!relativeDirPath.startsWith('./') && !relativeDirPath.startsWith('../')) {
        relativeDirPath = './' + relativeDirPath;
      }

      if (fs.existsSync(indexPath)) {
        let relativeIndexPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
        if (!relativeIndexPath.startsWith('./') && !relativeIndexPath.startsWith('../')) {
          relativeIndexPath = './' + relativeIndexPath;
        }
        pathsObj[aliasKey] = [relativeIndexPath];
      }

      pathsObj[`${aliasKey}/*`] = [`${relativeDirPath}/*`];
    }

    // 3. Add shared aliases from scanResult
    // Only generate entries for folders that actually exist on disk — spec requirement.
    for (const sharedEntry of scanResult.shared) {
      if (!fs.existsSync(sharedEntry.path)) continue;

      const aliasKey = sharedEntry.alias;

      let relativeDirPath = path.relative(cwd, sharedEntry.path).replace(/\\/g, '/');
      if (!relativeDirPath.startsWith('./') && !relativeDirPath.startsWith('../')) {
        relativeDirPath = './' + relativeDirPath;
      }

      let indexPath = path.join(sharedEntry.path, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(sharedEntry.path, 'index.js');
      }

      if (fs.existsSync(indexPath)) {
        let relativeIndexPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
        if (!relativeIndexPath.startsWith('./') && !relativeIndexPath.startsWith('../')) {
          relativeIndexPath = './' + relativeIndexPath;
        }
        pathsObj[aliasKey] = [relativeIndexPath];
      } else {
        // Folder exists but no index file — map to the directory itself
        pathsObj[aliasKey] = [relativeDirPath];
      }

      pathsObj[`${aliasKey}/*`] = [`${relativeDirPath}/*`];
    }
  // 3. Register manual custom aliases 
  if (config.aliases) {
    for (const [alias, target] of Object.entries(config.aliases)) {
      const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(cwd, target);
      const cleanAlias = alias.replace(/\/\*$/, '');
      
      let relativeTarget = path.relative(cwd, absoluteTarget).replace(/\\/g, '/');
      if (!relativeTarget.startsWith('./') && !relativeTarget.startsWith('../')) {
        relativeTarget = './' + relativeTarget;
      }

      const exists = fs.existsSync(absoluteTarget);
      const isDir = exists ? fs.statSync(absoluteTarget).isDirectory() : !path.extname(absoluteTarget);

      if (isDir) {
        const tsIndex = path.join(absoluteTarget, 'index.ts');
        const jsIndex = path.join(absoluteTarget, 'index.js');
        
        // Base mapping: prioritize index file for better IDE resolution
        if (fs.existsSync(tsIndex)) {
            const relIndex = path.relative(cwd, tsIndex).replace(/\\/g, '/');
            pathsObj[cleanAlias] = [relIndex.startsWith('.') ? relIndex : './' + relIndex];
        } else if (fs.existsSync(jsIndex)) {
            const relIndex = path.relative(cwd, jsIndex).replace(/\\/g, '/');
            pathsObj[cleanAlias] = [relIndex.startsWith('.') ? relIndex : './' + relIndex];
        } else {
            pathsObj[cleanAlias] = [relativeTarget];
        }
        
        // Wildcard mapping for sub-path resolution
        pathsObj[`${cleanAlias}/*`] = [`${relativeTarget}/*`];
      } else {
        // It's a file or doesn't exist yet (we still map it for TS)
        pathsObj[cleanAlias] = [relativeTarget];
      }
    }
  }

  return pathsObj;
}
