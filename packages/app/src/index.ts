// src/index.ts

import { registerIdentifierMetadata } from '@kerith/core/extension'
import { IDENTIFIER_CATALOG } from '@kerith/identifiers'
import { createApp as coreCreateApp, type CreateAppOptions, type KerithApp } from '@kerith/core'

// Channel executors
import { executeMiddlewareChannel } from './runtime/middleware-channel-executor.js'
import { executeCronChannel } from './runtime/cron-executor.js'
import { executeSchedulePassthroughChannel } from './runtime/schedule-passthrough-executor.js'
import { executeWorkerChannel } from './runtime/worker-executor.js'
import { executeMessageChannel } from './runtime/message-executor.js'
import { executeStreamChannel } from './runtime/stream-executor.js'
import { executeGatewayChannel } from './runtime/gateway-executor.js'
import { executeAliasChannel } from './runtime/alias-channel-executor.js'

// Registers the full catalog metadata into core.
for (const meta of IDENTIFIER_CATALOG) {
  registerIdentifierMetadata(meta)
}

/**
 * Wraps @kerith/core's createApp to inject the channel translation hook.
 * This ensures that identifier decorators executed during dynamic imports
 * are properly mapped to core extensions right before core resolves them.
 */
export async function createApp(app: any, options: CreateAppOptions = {}): Promise<KerithApp> {
  const originalHook = options._onDynamicImportsComplete;
  
  const internalOptions: CreateAppOptions = {
    ...options,
    _onDynamicImportsComplete: async () => {
      executeAliasChannel();
      executeMiddlewareChannel();
      executeSchedulePassthroughChannel();
      await executeCronChannel();
      await executeWorkerChannel();
      await executeMessageChannel();
      await executeStreamChannel();
      await executeGatewayChannel();

      if (originalHook) {
        await originalHook();
      }
    }
  };
  
  return coreCreateApp(app, internalOptions);
}

// Re-export the full public surface.
// Note: our explicit createApp export above overrides the one from @kerith/core.
export * from '@kerith/core'
export * from '@kerith/identifiers'
export type { IdentifierCategory, IdentifierMetadata } from '@kerith/core'
