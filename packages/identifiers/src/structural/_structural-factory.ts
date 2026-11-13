// src/structural/_structural-factory.ts

import path from 'node:path';
import { getFileCallerInfo } from '@kerith/core';
import type { IdentifierCategory } from '../catalog/metadata.js';
import type { BaseStructuralOptions } from './types.js';
import { registerStructuralEntry } from './store.js';

export function createStructuralIdentifier<TOptions extends BaseStructuralOptions = BaseStructuralOptions>(
  publicName: string,
  category: IdentifierCategory,
  trackable = true,
): (name: string, options?: TOptions) => void {
  return function (name: string, options: TOptions = {} as TOptions): void {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError(`${publicName} name must be a non-empty string, received ${typeof name}`);
    }

    const { filePath } = getFileCallerInfo(`${publicName}()`);
    const inferredModule = options.module ?? path.basename(path.dirname(filePath));

    registerStructuralEntry({
      type: publicName,
      category,
      name,
      filePath,
      module: inferredModule,
      trackable,
      options: { ...options },
    });
  };
}

