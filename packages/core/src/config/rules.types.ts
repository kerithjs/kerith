export type QualityRuleValue<T> = T | false;

export interface QualityRulesConfig {
  /** Maximum folder depth within a module. Default: 3 */
  maxModuleDepth?: QualityRuleValue<number>;
  /** Maximum number of distinct modules this module can import. Default: 5 */
  fanOutThreshold?: QualityRuleValue<number>;
  /** Maximum number of distinct modules that can import this module. Default: 5 */
  fanInThreshold?: QualityRuleValue<number>;
  /** Maximum number of files per module. Default: 30 */
  maxModuleFiles?: QualityRuleValue<number>;
  /** Maximum number of SubModules per module. Default: 5 */
  maxSubModulesPerModule?: QualityRuleValue<number>;
  /** Detect declared exports that no module imports. Default: true */
  unusedExports?: QualityRuleValue<boolean>;
  /** Detect modules without any registered identifiers. Default: true */
  emptyModule?: QualityRuleValue<boolean>;
  /** Detect dependency cycles between modules. Default: true */
  circularDependency?: QualityRuleValue<boolean>;
  /** Bootstrap cycles before purging a stale module. Default: 3 */
  stalePurgeCycles?: QualityRuleValue<number>;
  /** Ms before MODULE_LOAD_TIMEOUT during bootstrap. Default: 30000 */
  moduleLoadTimeout?: QualityRuleValue<number>;
}

export interface ResolvedQualityRules {
  maxModuleDepth: number | null; // null = disabled
  fanOutThreshold: number | null;
  fanInThreshold: number | null;
  maxModuleFiles: number | null;
  maxSubModulesPerModule: number | null;
  unusedExports: boolean;
  emptyModule: boolean;
  circularDependency: boolean;
  stalePurgeCycles: number;
  moduleLoadTimeout: number;
}

export const DEFAULT_QUALITY_RULES: ResolvedQualityRules = {
  maxModuleDepth: 3,
  fanOutThreshold: 5,
  fanInThreshold: 5,
  maxModuleFiles: 30,
  maxSubModulesPerModule: 5,
  unusedExports: true,
  emptyModule: true,
  circularDependency: true,
  stalePurgeCycles: 3,
  moduleLoadTimeout: 30_000,
};

export function resolveQualityRules(
  config?: QualityRulesConfig
): ResolvedQualityRules {
  if (!config) return { ...DEFAULT_QUALITY_RULES };

  const resolveNumeric = (
    val: QualityRuleValue<number> | undefined,
    def: number | null
  ): number | null => {
    if (val === false) return null;
    if (val === undefined) return def;
    return val;
  };

  const resolveBoolean = (
    val: QualityRuleValue<boolean> | undefined,
    def: boolean
  ): boolean => {
    if (val === false) return false;
    if (val === undefined) return def;
    return val;
  };

  return {
    maxModuleDepth: resolveNumeric(
      config.maxModuleDepth,
      DEFAULT_QUALITY_RULES.maxModuleDepth
    ),
    fanOutThreshold: resolveNumeric(
      config.fanOutThreshold,
      DEFAULT_QUALITY_RULES.fanOutThreshold
    ),
    fanInThreshold: resolveNumeric(
      config.fanInThreshold,
      DEFAULT_QUALITY_RULES.fanInThreshold
    ),
    maxModuleFiles: resolveNumeric(
      config.maxModuleFiles,
      DEFAULT_QUALITY_RULES.maxModuleFiles
    ),
    maxSubModulesPerModule: resolveNumeric(
      config.maxSubModulesPerModule,
      DEFAULT_QUALITY_RULES.maxSubModulesPerModule
    ),
    unusedExports: resolveBoolean(
      config.unusedExports,
      DEFAULT_QUALITY_RULES.unusedExports
    ),
    emptyModule: resolveBoolean(
      config.emptyModule,
      DEFAULT_QUALITY_RULES.emptyModule
    ),
    circularDependency: resolveBoolean(
      config.circularDependency,
      DEFAULT_QUALITY_RULES.circularDependency
    ),
    stalePurgeCycles: resolveNumeric(
      config.stalePurgeCycles,
      DEFAULT_QUALITY_RULES.stalePurgeCycles
    ) as number, // Cast or handle default because stalePurgeCycles is always number in default
    moduleLoadTimeout: resolveNumeric(
      config.moduleLoadTimeout,
      DEFAULT_QUALITY_RULES.moduleLoadTimeout
    ) as number,
  };
}
