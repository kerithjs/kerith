/**
 * generators/app-template.ts
 *
 * Takes the file map produced by core-template and PATCHES it to add
 * the @kerith/app + @kerith/identifiers layer.
 *
 * It does NOT regenerate the base skeleton — that is core-template's job.
 * Anything added here must be strictly additive or a targeted override of
 * an existing file (e.g. package.json deps, server.ts imports).
 */

import { APP_VERSION, IDENTIFIERS_VERSION } from '../versions.js';
import { generateChannelStubs, type ChannelType } from './channel-stubs.js';

export interface AppTemplateInput {
  projectName: string;
  language: 'ts' | 'js';
  channels: ChannelType[];
  redis: boolean;
  socketio: boolean;
}

/**
 * Patches `baseFiles` in-place (returns a new map) with the additions
 * required for the `app` template.
 */
export function buildAppTemplate(
  baseFiles: Record<string, string>,
  input: AppTemplateInput,
): Record<string, string> {
  const files = { ...baseFiles };

  // ── Patch 1: package.json ───────────────────────────────────────────────
  if (files['package.json']) {
    const pkg = JSON.parse(files['package.json']);
    
    pkg.dependencies = pkg.dependencies || {};
    
    pkg.dependencies['@kerith/app'] = `^${APP_VERSION}`;
    pkg.dependencies['@kerith/identifiers'] = `^${IDENTIFIERS_VERSION}`;

    if (input.redis) {
      pkg.dependencies['ioredis'] = '^5.4.0';
    }

    if (input.socketio) {
      pkg.dependencies['socket.io'] = '^4.7.5';
    }

    files['package.json'] = JSON.stringify(pkg, null, 2);
  }

  // ── Patch 2: server.ts / server.js ────────────────────────────────────
  const serverPath = files['src/server.ts'] ? 'src/server.ts' : 'src/server.js';
  if (files[serverPath]) {
    // We use a regex to only target the import statement from '@kerith/core'
    // avoiding accidental replacements in comments or strings.
    files[serverPath] = files[serverPath].replace(
      /(import\s+.*?from\s+['"])@kerith\/core(['"])/g,
      '$1@kerith/app$2'
    );
  }

  // ── Patch 3: kerith.config.ts / kerith.config.js ───────────────────────
  const configPath = files['kerith.config.ts'] ? 'kerith.config.ts' : 'kerith.config.js';
  if (files[configPath]) {
    files[configPath] = files[configPath]
      // Replace ESM import statement
      .replace(
        /(import\s+.*?from\s+['"])@kerith\/core(['"])/g,
        '$1@kerith/app$2'
      )
      // Replace JSDoc import() statement
      .replace(
        /(import\(['"])@kerith\/core(['"]\))/g,
        '$1@kerith/app$2'
      );
  }

  // ── Patch 4: Channel Stubs ─────────────────────────────────────────────
  if (input.channels && input.channels.length > 0) {
    const channelFiles = generateChannelStubs({
      projectName: input.projectName,
      language: input.language,
      channels: input.channels,
      redis: input.redis,
      socketio: input.socketio,
    });
    Object.assign(files, channelFiles);
  }

  return files;
}
