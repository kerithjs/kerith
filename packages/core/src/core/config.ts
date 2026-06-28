import type { ResolvedConfig, LogHandler } from '../types/index.js';
import { loadKerithConfig } from '../config/kerith-config.js';
import { defaultLogHandler, resolveLogLevel } from './logger.js';

const defaultStrict = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

export const DEFAULTS: Omit<ResolvedConfig, 'aliases' | 'modules' | 'origin'> = {
  prefix: '',
  strict: defaultStrict,
  resolveAliases: true,
  logger: defaultLogHandler,
  logLevel: resolveLogLevel(),
  logFormat: 'auto',
  nits: {
    enabled: true,
    similarityThreshold: undefined, // Use dynamic by default
  },
  logging: {
    maxRouteLines: 5,
  },
  requirePreloader: false,
  coupling: {
    fanOut: { threshold: 5, severity: 'warn' as const },
    fanIn:  { threshold: 5, severity: 'warn' as const },
  },
  rules: {
    moduleLoadTimeout: 30_000,
    stalePurgeCycles: 5
  }
};

export type BootConfig = ResolvedConfig & { resolvedAliases: Map<string, string> };

export const loadConfig = async (
  options: { logger?: LogHandler } = {}
): Promise<BootConfig> => {
  const cwd = process.cwd();
  
  const fileConfig = await loadKerithConfig(cwd, options.logger);

  let finalOrigin = fileConfig.origin;
  let finalModules = fileConfig.modules;

  if (!finalOrigin && !finalModules) {
    finalOrigin = 'src';
  } else if (!finalOrigin && finalModules) {
    // v1.x legacy mode
    finalOrigin = undefined;
  } else if (finalOrigin) {
    // origin takes precedence
    finalModules = undefined;
  }

  return {
    ...fileConfig,
    modules:             finalModules,
    origin:              finalOrigin,
    prefix:              fileConfig.prefix              ?? DEFAULTS.prefix,
    strict:              fileConfig.strict              ?? DEFAULTS.strict,
    resolveAliases:      fileConfig.resolveAliases      ?? DEFAULTS.resolveAliases,
    aliases:             fileConfig.aliases             ?? {},
    logger:              options.logger                 ?? defaultLogHandler,
    logLevel:            resolveLogLevel(fileConfig.logLevel),
    logFormat:           fileConfig.logFormat           ?? DEFAULTS.logFormat,
    nits: {
      enabled:             fileConfig.nits?.enabled             ?? DEFAULTS.nits.enabled,
      similarityThreshold: fileConfig.nits?.similarityThreshold ?? DEFAULTS.nits.similarityThreshold,
    },
    logging: {
      maxRouteLines:       fileConfig.logging?.maxRouteLines    ?? DEFAULTS.logging.maxRouteLines,
    },
    requirePreloader:    fileConfig.requirePreloader    ?? DEFAULTS.requirePreloader,
    coupling: {
      fanOut: {
        threshold: fileConfig.coupling?.fanOut?.threshold ?? DEFAULTS.coupling.fanOut.threshold,
        severity:  'warn',
      },
      fanIn: {
        threshold: fileConfig.coupling?.fanIn?.threshold ?? DEFAULTS.coupling.fanIn.threshold,
        severity:  'warn',
      },
    },
    rules: {
      moduleLoadTimeout: fileConfig.rules?.moduleLoadTimeout ?? DEFAULTS.rules.moduleLoadTimeout,
      stalePurgeCycles:  fileConfig.rules?.stalePurgeCycles  ?? DEFAULTS.rules.stalePurgeCycles
    },
    resolvedAliases:     fileConfig.resolvedAliases     ?? new Map(),
  };
};
