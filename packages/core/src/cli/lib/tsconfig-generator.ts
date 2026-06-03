import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { KerithConfig } from '../../config/kerith-config.types.js';

export async function generatePathAliases(config: KerithConfig, cwd: string): Promise<Record<string, string[]>> {
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
