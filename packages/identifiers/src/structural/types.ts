// src/structural/types.ts

import type { IdentifierCategory } from '../catalog/metadata.js';

export interface StructuralEntry {
  /** Identifier type, e.g. 'Entity', 'Migration', 'Job', etc. */
  type: string;
  /** Category defined in metadata, e.g. 'data', 'security', 'workers' */
  category: IdentifierCategory;
  /** Name assigned by the user */
  name: string;
  /** File path where this identifier was called */
  filePath: string;
  /** Inferred or explicit module name */
  module: string;
  /** Whether this identifier is trackable by registries/tools */
  trackable: boolean;
  /** Optional user-provided options/metadata */
  options: Record<string, unknown>;
}

export interface BaseStructuralOptions {
  /**
   * Explicit module override. If omitted, inferred from the parent directory.
   */
  module?: string;
  /**
   * Semantic description of the component.
   */
  description?: string;
  /**
   * Additional metadata for tooling, schema generation or documentation.
   */
  [key: string]: unknown;
}

