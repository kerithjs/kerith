import { KERITH_CONTROLLER, KERITH_ROUTES } from './symbols.js';
import type { AppControllerOptions, AppControllerMeta } from '../types/routing.js';
import { getFileCallerInfo, getActiveRegistry } from '@kerith/core';
import path from 'node:path';

export function Controller(prefix: string, options?: AppControllerOptions) {
  if (typeof prefix !== 'string') {
    throw new TypeError('Controller prefix must be a string');
  }

  let registry;
  let callerFilePath: string | undefined;

  try {
    const callerInfo = getFileCallerInfo('Controller()');
    callerFilePath = callerInfo.filePath;
    registry = getActiveRegistry();
  } catch {
    // Either no active registry (isolated unit tests) or caller info failed.
    // Safe to ignore: we skip traditional registration and just return the decorator.
  }

  // If both traditional function and decorator are used in the same file, 
  // the first one (traditional function, usually at the top) wins.
  if (registry && callerFilePath) {
    // Exact same normalization as core/utils/paths.ts to ensure registry key matches
    let normalizedPath = callerFilePath.replace(/\\/g, '/');
    if (process.platform === 'win32' && /^[a-z]:/i.test(normalizedPath)) {
      normalizedPath = normalizedPath[0].toUpperCase() + normalizedPath.slice(1);
    }

    if (!registry.getControllerMetadata(normalizedPath)) {
      const name = path.parse(callerFilePath).name;
      registry.registerControllerMetadata({
        name,
        path: normalizedPath,
        prefix,
        middlewares: options?.middlewares ?? [],
        enabled: options?.enabled ?? true,
        metadata: options?.metadata,
      });
    }
  }

  return function <T extends { new (...args: any[]): {} }>(target: T): void {
    const routes = (target.prototype as any)[KERITH_ROUTES] || [];

    const meta: AppControllerMeta = {
      prefix,
      routes,
      middlewares: options?.middlewares ?? [],
      metadata: options?.metadata,
      enabled: options?.enabled,
    };

    (target as any)[KERITH_CONTROLLER] = meta;
  };
}
