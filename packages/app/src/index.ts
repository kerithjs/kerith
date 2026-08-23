// src/index.ts
import { setInfrastructureOptions } from './runtime/infrastructure-context.js'
import { registerIdentifierMetadata } from '@kerith/core/extension'
import { IDENTIFIER_CATALOG, getBindingPlugins } from '@kerith/identifiers'
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

// Adapters
import { loadSocketIOTransport } from './adapters/socket-io.js'

// Registers the full catalog metadata into core.
for (const meta of IDENTIFIER_CATALOG) {
  registerIdentifierMetadata(meta)
}

/**
 * Options for creating a Kerith Application, extending the core options with
 * infrastructure configuration specific to the @kerith/app execution environment.
 */
export interface AppCreateAppOptions extends CreateAppOptions {
  infrastructure?: import('./adapters/redis-connection.js').InfrastructureOptions;
}

/**
 * Wraps @kerith/core's createApp to inject the channel translation hook.
 * This ensures that identifier decorators executed during dynamic imports
 * are properly mapped to core extensions right before core resolves them.
 */
export async function createApp(app: any, options: AppCreateAppOptions = {}): Promise<KerithApp> {
  const { infrastructure, ...coreOptions } = options;
  const originalHook = coreOptions._onDynamicImportsComplete;

  setInfrastructureOptions(infrastructure);

  const internalOptions: CreateAppOptions = {
    ...coreOptions,
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

  const kerithApp = await coreCreateApp(app, internalOptions);

  // ── Gateway bridge: conecta Socket.io al servidor HTTP real recién acá,
  // que es el único punto del ciclo de vida donde el servidor existe. ──
  const originalListen = kerithApp.listen.bind(kerithApp);
  kerithApp.listen = async (server, listenOptions) => {
    const hasGateways = getBindingPlugins().some(p => p.kind === 'gateway');
    if (hasGateways) {
      const transport = await loadSocketIOTransport();
      await transport.attach(server);
    }
    return originalListen(server, listenOptions);
  };

  return kerithApp;
}

// Re-export the full public surface.
// Note: our explicit createApp export above overrides the one from @kerith/core.
export * from '@kerith/core'
export * from '@kerith/identifiers'
export type { IdentifierCategory, IdentifierMetadata } from '@kerith/core'

// Controller decorators
export { Controller } from './decorators/controller.js';
export { Get, Post, Put, Patch, Delete } from './decorators/methods.js';
export type { RouteDefinition, AppControllerMeta, AppControllerOptions } from './types/routing.js';
export { KERITH_CONTROLLER } from './decorators/symbols.js';
