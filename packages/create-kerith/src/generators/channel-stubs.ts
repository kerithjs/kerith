/**
 * generators/channel-stubs.ts
 *
 * Generates stub files for each selected channel type.
 * One function per channel so each can be tested in isolation.
 *
 * Channels: alias | middleware | cron | worker | gateway
 */

export type ChannelType = 'alias' | 'middleware' | 'cron' | 'worker' | 'gateway';

export interface ChannelStubOptions {
  projectName: string;
  language: 'ts' | 'js';
  channels: ChannelType[];
  redis: boolean;
  socketio: boolean;
}

/**
 * Produces a partial file map with stub source files for every
 * channel listed in `options.channels`.
 */
export function generateChannelStubs(
  options: ChannelStubOptions,
): Record<string, string> {
  const files: Record<string, string> = {};
  const ext = options.language;

  if (options.channels.includes('alias')) {
    files[`src/channels/alias.${ext}`] = aliasStub(options.projectName);
  }
  if (options.channels.includes('middleware')) {
    files[`src/channels/middleware.${ext}`] = middlewareStub(options.projectName, options.language);
  }
  if (options.channels.includes('cron')) {
    files[`src/channels/cron.${ext}`] = cronStub(options.projectName);
  }
  if (options.channels.includes('worker')) {
    files[`src/channels/worker.${ext}`] = workerStub(options.projectName, options.redis);
  }
  if (options.channels.includes('gateway')) {
    files[`src/channels/gateway.${ext}`] = gatewayStub(options.projectName, options.socketio);
  }

  return files;
}

// ---------------------------------------------------------------------------
// Per-channel helpers (exported for unit testing)
// ---------------------------------------------------------------------------

export function aliasStub(_projectName: string): string {
  return `import { Client } from '@kerith/identifiers';

// Registers a named client instance as a resolvable alias @client/Database
Client('Database', () => ({ connected: true }));
`;
}

export function middlewareStub(_projectName: string, language: 'ts' | 'js' = 'ts'): string {
  const nextCall = language === 'ts' ? '(next as Function)();' : 'next();';
  return `import { Middleware } from '@kerith/identifiers';

// Registers a named middleware.
// Only applies to controllers declaring it in metadata.middlewareNames
Middleware('logger', (req, res, next) => {
  console.log('Request received');
  ${nextCall}
});
`;
}

export function cronStub(_projectName: string): string {
  return `import { Cron } from '@kerith/identifiers';

// Registers a scheduled job using a cron expression.
// Note: Uses three positional arguments.
Cron('daily-cleanup', '0 2 * * *', async () => {
  console.log('Running daily cleanup...');
});
`;
}

export function workerStub(_projectName: string, redis: boolean): string {
  const optionsStr = redis ? `, { concurrency: 5 }` : ``;
  return `import { Worker } from '@kerith/identifiers';

// Registers a worker that processes background jobs.
Worker('process-image', async (job) => {
  console.log('Processing job', job);
}${optionsStr});
`;
}

export function gatewayStub(_projectName: string, socketio: boolean): string {
  const optionsStr = socketio ? `, { namespace: '/chat' }` : ``;
  return `import { Gateway } from '@kerith/identifiers';

// Registers a Gateway for real-time communication.
Gateway('chat', (socket) => {
  console.log('New connection');
}${optionsStr});
`;
}
