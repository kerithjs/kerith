import fg from 'fast-glob';
import { ViolationType, type Violation } from './violations.js';
import type { ResolvedQualityRules } from '../../config/rules.types.js';
import type { ModuleLike } from './depth-checker.js';

/** Minimal shape required — satisfied by both SubModuleScanEntry and SubModuleNode. */
export interface SubModuleLike {
  name: string;
  dirPath: string;
  parentModule: string;
  domain?: string;
}

export function getModuleFileCount(moduleDirPath: string): number {
  try {
    const files = fg.sync('**/*.{ts,js,mts,mjs}', {
      cwd: moduleDirPath,
      onlyFiles: true,
      ignore: [
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.d.ts',
        '**/.kerith/**', // Excludes config and internal generated files
      ],
    });
    return files.length;
  } catch {
    return 0;
  }
}

export function detectSizeViolations(
  modules: (ModuleLike & { domain?: string })[],
  submodules: SubModuleLike[],
  rules: ResolvedQualityRules
): Violation[] {
  const violations: Violation[] = [];

  for (const mod of modules) {
    if (rules.maxModuleFiles !== null) {
      const fileCount = getModuleFileCount(mod.dirPath);
      if (fileCount > rules.maxModuleFiles) {
        violations.push({
          type: ViolationType.MODULE_TOO_LARGE,
          module: mod.name,
          severity: 'warn',
          message: `Too many files in the module (${fileCount} files, max ${rules.maxModuleFiles})`,
          suggestion: 'Consider extracting logic into a SubModule',
        });
      }
    }

    if (rules.maxSubModulesPerModule !== null) {
      // Filter submodules belonging to this specific module (considering domain if applicable)
      const moduleSubmodules = submodules.filter(
        (sub) => sub.parentModule === mod.name && sub.domain === mod.domain
      );
      const submodulesCount = moduleSubmodules.length;

      if (submodulesCount > rules.maxSubModulesPerModule) {
        violations.push({
          type: ViolationType.TOO_MANY_SUBMODULES,
          module: mod.name,
          severity: 'warn',
          message: `Too many SubModules in the module (${submodulesCount} SubModules, max ${rules.maxSubModulesPerModule})`,
          suggestion: 'Consider promoting some SubModules to independent modules or creating a domain',
        });
      }
    }
  }

  return violations;
}
