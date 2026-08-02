/**
 * generators/core-template.ts
 *
 * Thin wrapper over `generateProjectStructure` from `@kerith/core/cli`.
 *
 * RULE: this file must NOT contain any template strings, file-content
 * literals, or generation logic. It is a single call — no more.
 *
 * If something is missing from the output, the fix goes in
 * `@kerith/core/cli` (new export or updated generateProjectStructure),
 * NOT here.
 */

import { generateProjectStructure } from '@kerith/core/cli';

import { CORE_VERSION } from '../versions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoreTemplateInput {
  /** Absolute path where the project will be created. */
  outDir: string;
  projectName: string;
  /** File extension: 'ts' | 'js' */
  language: 'ts' | 'js';
  /** Port as a number — converted to string for core's API. */
  port: number;
  /** Route prefix, empty string means none. */
  routePrefix: string;
  /**
   * When true, validateDirectoryGuard runs in --yes mode (no interactive
   * confirmation if the directory is non-empty).
   */
  yes: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates the target directory and returns the base project file map
 * by delegating entirely to `@kerith/core/cli#generateProjectStructure`.
 *
 * Returns `Record<string, string>` — relative paths to file contents.
 * The caller (fs-writer.ts) is responsible for writing these to disk.
 */
export function buildCoreTemplate(
  input: CoreTemplateInput,
): Record<string, string> {
  return generateProjectStructure(
    input.projectName,
    input.language,          // ext: 'ts' | 'js'
    String(input.port),      // core expects port as string
    input.routePrefix,
    CORE_VERSION,
  );
}
