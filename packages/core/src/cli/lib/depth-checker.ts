import fg from 'fast-glob';
import { ViolationType, type Violation } from './violations.js';
import type { ResolvedQualityRules } from '../../config/rules.types.js';

/** Minimal shape required — satisfied by both ModuleScanEntry and ModuleNode. */
export interface ModuleLike {
  name: string;
  dirPath: string;
}

export function getModuleDepth(moduleDirPath: string): number {
  try {
    const files = fg.sync('**/*.{ts,js,mts,mjs}', {
      cwd: moduleDirPath,
      onlyFiles: true,
      ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
    });

    let maxDepth = 0;
    for (const file of files) {
      // file is a relative path with '/' separators thanks to fast-glob
      const parts = file.split('/').filter((p) => p.length > 0);
      // Depth is the number of folders, which is equal to parts.length - 1
      const depth = Math.max(0, parts.length - 1);
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
    return maxDepth;
  } catch {
    return 0;
  }
}

export function getDeepestPath(moduleDirPath: string): string | null {
  try {
    const files = fg.sync('**/*.{ts,js,mts,mjs}', {
      cwd: moduleDirPath,
      onlyFiles: true,
      ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
    });

    if (files.length === 0) return null;

    let maxDepth = -1;
    let deepestPath: string | null = null;

    for (const file of files) {
      const parts = file.split('/').filter((p) => p.length > 0);
      const depth = Math.max(0, parts.length - 1);
      if (depth > maxDepth) {
        maxDepth = depth;
        deepestPath = file;
      }
    }
    return deepestPath;
  } catch {
    return null;
  }
}

export function detectDepthViolations(
  modules: ModuleLike[],
  rules: ResolvedQualityRules
): Violation[] {
  if (rules.maxModuleDepth === null) return [];

  const violations: Violation[] = [];

  for (const mod of modules) {
    const depth = getModuleDepth(mod.dirPath);
    if (depth > rules.maxModuleDepth) {
      const deepestPath = getDeepestPath(mod.dirPath);
      violations.push({
        type: ViolationType.MODULE_DEPTH_EXCEEDED,
        module: mod.name,
        message: `Excessive depth (${depth} levels, max ${rules.maxModuleDepth})`,
        suggestion: deepestPath
          ? `Consider moving the code from '${deepestPath}' into a SubModule`
          : `Consider splitting '${mod.name}' into SubModules`,
        severity: 'warn',
      });
    }
  }

  return violations;
}
