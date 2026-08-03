/**
 * prompts.ts
 *
 * All @clack/prompts interactions live here — zero generation logic.
 *
 * Generators must be pure functions (input → Record<string,string>).
 * They never touch stdin. This module is the only place that does.
 *
 * ── Channel gating rule ────────────────────────────────────────────────────
 * A channel only appears in the multiselect when its stub in channel-stubs.ts
 * is fully implemented. Add a channel to IMPLEMENTED_CHANNELS only after
 * its generator function no longer throws "not yet implemented".
 * This prevents offering an option that silently produces nothing — the root
 * cause of the Middleware/Worker/Gateway bug in the previous version.
 * ──────────────────────────────────────────────────────────────────────────
 */

import * as p from '@clack/prompts';
import type { ChannelType } from './generators/channel-stubs.js';

// ---------------------------------------------------------------------------
// Channel gate — single source of truth for "what is ready to generate"
// ---------------------------------------------------------------------------

/**
 * Add a channel here ONLY when its generator in channel-stubs.ts is
 * implemented and tested. Order determines display order in the multiselect.
 */
export const IMPLEMENTED_CHANNELS: readonly ChannelType[] = [
  'alias',
  'middleware',
  'cron',
  'worker',
  'gateway',
] as const;

// ---------------------------------------------------------------------------
// UserChoices — the single object flowing from prompts → generators
// ---------------------------------------------------------------------------

export interface UserChoices {
  /** Destination directory (may be relative; index.ts resolves to absolute). */
  outDir: string;
  projectName: string;
  template: 'core' | 'app';
  language: 'ts' | 'js';
  /** Empty array when template is 'core' or no channels were selected. */
  channels: ChannelType[];
  /** True when worker or cron is in channels. */
  redis: boolean;
  /** True when gateway is in channels. */
  socketio: boolean;
  port: number;
  /** Empty string means no prefix. */
  routePrefix: string;
  installDeps: boolean;
}

// ---------------------------------------------------------------------------
// --yes defaults — every field documented, nothing inferred
// ---------------------------------------------------------------------------

/**
 * The complete set of defaults used when --yes is passed.
 * Documented here explicitly so callers never have to guess.
 */
export const YES_DEFAULTS = {
  outDir: '.',
  projectName: 'kerith-project',
  template: 'core',
  language: 'ts',
  channels: [],
  redis: false,
  socketio: false,
  port: 3000,
  routePrefix: '',
  installDeps: true,
} as const satisfies UserChoices;

// ---------------------------------------------------------------------------
// Flags — values that can be pre-filled via CLI arguments
// ---------------------------------------------------------------------------

/** Subset of UserChoices that commander can supply before prompting. */
export interface CliFlags {
  yes?: boolean;
  projectName?: string;
  template?: 'core' | 'app';
  language?: 'ts' | 'js';
  port?: number;
  prefix?: string;
  noInstall?: boolean;
  outDir?: string;
}

// ---------------------------------------------------------------------------
// Port validator
// ---------------------------------------------------------------------------

export function validatePort(raw: string): string | undefined {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return 'Port must be an integer between 1 and 65535';
  }
  return undefined; // valid
}

// ---------------------------------------------------------------------------
// Project Name Validator & Sanitizer
// ---------------------------------------------------------------------------

export function isValidNpmName(name: string): boolean {
  // npm package name regex
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}

export function sanitizeProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-~._@/]/g, '');
}

// ---------------------------------------------------------------------------
// Prompt runner
// ---------------------------------------------------------------------------

/**
 * Runs all interactive prompts and returns a complete UserChoices object.
 *
 * If `flags.yes` is true, skips all prompts and returns YES_DEFAULTS merged
 * with any flags already provided by the caller.
 *
 * Exits the process cleanly if the user cancels (Ctrl-C).
 */
export async function runPrompts(flags: CliFlags = {}): Promise<UserChoices> {
  // ── --yes / non-interactive ────────────────────────────────────────────
  if (flags.yes) {
    const rawProjectName = flags.projectName ?? YES_DEFAULTS.projectName;
    return {
      ...YES_DEFAULTS,
      ...(flags.outDir !== undefined && { outDir: flags.outDir }),
      projectName: sanitizeProjectName(rawProjectName),
      ...(flags.template !== undefined && { template: flags.template }),
      ...(flags.language !== undefined && { language: flags.language }),
      ...(flags.port !== undefined && { port: flags.port }),
      ...(flags.prefix !== undefined && { routePrefix: flags.prefix }),
      ...(flags.noInstall !== undefined && { installDeps: !flags.noInstall }),
    };
  }

  // ── Interactive ────────────────────────────────────────────────────────
  p.intro('create-kerith');

  // Helper: abort gracefully on Ctrl-C
  function abortIfCancelled<T>(value: T | symbol): T {
    if (p.isCancel(value)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    return value as T;
  }

  // 1. Project name
  const projectName = abortIfCancelled(
    await p.text({
      message: 'Project name',
      placeholder: 'kerith-project',
      defaultValue: flags.projectName ? sanitizeProjectName(flags.projectName) : YES_DEFAULTS.projectName,
      validate: (v) => {
        if (v.trim().length === 0) return 'Project name cannot be empty';
        if (!isValidNpmName(v.trim())) return 'Invalid npm package name (lowercase, no spaces, allowed chars: - . _ ~)';
        return undefined;
      },
    }),
  );

  // 2. Template
  const template = abortIfCancelled(
    await p.select<'core' | 'app'>({
      message: 'Template',
      initialValue: flags.template ?? YES_DEFAULTS.template,
      options: [
        {
          value: 'core',
          label: 'core',
          hint: 'Minimal — router + channels + preload hook',
        },
        {
          value: 'app',
          label: 'app',
          hint: 'Core + @kerith/app + @kerith/identifiers',
        },
      ],
    }),
  );

  // 3. Language
  const language = abortIfCancelled(
    await p.select<'ts' | 'js'>({
      message: 'Language',
      initialValue: flags.language ?? YES_DEFAULTS.language,
      options: [
        { value: 'ts', label: 'TypeScript' },
        { value: 'js', label: 'JavaScript' },
      ],
    }),
  );

  // 4. Channels (only if template = app AND there are implemented channels)
  let channels: ChannelType[] = [];

  if (template === 'app' && IMPLEMENTED_CHANNELS.length > 0) {
    const channelOptions = IMPLEMENTED_CHANNELS.map((c) => ({
      value: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
    }));

    const selected = abortIfCancelled(
      await p.multiselect<ChannelType>({
        message: 'Channels to include (space to toggle, enter to confirm)',
        options: channelOptions,
        required: false,
      }),
    );

    channels = selected as ChannelType[];
  }

  // 5. Redis (only if worker or cron selected)
  let redis: boolean = YES_DEFAULTS.redis;
  const needsRedis =
    channels.includes('worker') || channels.includes('cron');

  if (needsRedis) {
    redis = abortIfCancelled(
      await p.confirm({
        message: 'Generate Redis connection stub? (ioredis)',
        initialValue: YES_DEFAULTS.redis,
      }),
    );
  }

  // 6. Socket.io (only if gateway selected)
  let socketio: boolean = YES_DEFAULTS.socketio;

  if (channels.includes('gateway')) {
    socketio = abortIfCancelled(
      await p.confirm({
        message: 'Include Socket.io support?',
        initialValue: YES_DEFAULTS.socketio,
      }),
    );
  }

  // 7. Port
  const portRaw = abortIfCancelled(
    await p.text({
      message: 'Port',
      placeholder: String(YES_DEFAULTS.port),
      defaultValue: flags.port !== undefined
        ? String(flags.port)
        : String(YES_DEFAULTS.port),
      validate: validatePort,
    }),
  );
  const port = Number(portRaw);

  // 8. Route prefix
  const routePrefix = abortIfCancelled(
    await p.text({
      message: 'Route prefix',
      placeholder: '(none)',
      defaultValue: flags.prefix ?? YES_DEFAULTS.routePrefix,
    }),
  );

  // 9. Install deps
  const installDeps = abortIfCancelled(
    await p.confirm({
      message: 'Install dependencies now?',
      initialValue: flags.noInstall !== undefined
        ? !flags.noInstall
        : YES_DEFAULTS.installDeps,
    }),
  );

  p.outro('Generating project…');

  return {
    outDir: flags.outDir ?? YES_DEFAULTS.outDir,
    projectName: projectName.trim(),
    template,
    language,
    channels,
    redis,
    socketio,
    port,
    routePrefix: routePrefix.trim(),
    installDeps,
  };
}
