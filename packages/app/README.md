# @kerith/app

Runtime adapter layer for Kerith framework. Provides execution engines for the Extension API channels (Middleware, Schedule, Binding) and integrates with Express.

## Extension API

The Extension API allows third-party packages to extend Kerith by registering providers across four channels:

### Channels

#### 1. Alias Channel
Providers in this channel define import aliases that can be resolved at runtime.

**Identifiers:** `Client`, `Config`, `Provider`, `Store`, `Vault`, `Publisher`, `Tracer`

**Provider Interface:**
```typescript
interface AliasProvider {
  prefix: string;
  name: string;
  filePath: string;
  resolve: () => unknown;
}
```

**⚠️ Important Note about `resolve()`:**
> `AliasProvider.resolve()` is reserved for a future dependency injection container. It is not invoked anywhere in `@kerith/core` or `@kerith/app` in v2.0.0-alpha.1. Current alias resolution works via `filePath` + `activateAliasResolver` (ESM loader hook) without calling `resolve()`. This will be reevaluated if a real use case emerges (e.g., purely programmatic aliases without a backing file).

#### 2. Middleware Channel
Providers in this channel register request/response processing middleware.

**Identifiers:** `Guard`, `RateLimit`, `Firewall`, `Middleware`, `Interceptor`, `Pipe`, `Filter`, `Webhook`

**Provider Interface:**
```typescript
interface MiddlewareResolver {
  name: string;
  filePath: string;
  phase: 'pre' | 'post' | 'error';
  priority: number;
  getHandlers(controller: ControllerEntry): unknown[];
}
```

#### 3. Schedule Channel
Providers in this channel register scheduled tasks.

**Identifiers:** `Cron`, `Daemon`, `HealthCheck`, `Probe`

**Provider Interface:**
```typescript
interface ScheduleProvider {
  name: string;
  filePath: string;
  timing: 'after-bootstrap' | 'on-listen' | 'on-shutdown';
  execute(): Promise<void> | void;
}
```

**⚠️ Fail-Soft Behavior:**
> All three Schedule execution points (`after-bootstrap`, `on-listen`, `on-shutdown`) are fail-soft by design. If a schedule provider throws an error, it is logged with the schedule name and execution continues with the next provider. A broken `Cron()` or `Daemon()` is considered a user extension error ([app] tier) and will not crash the entire application or prevent other schedules from running. This is different from Binding, which is fail-fast (see Binding Channel section).

#### 4. Binding Channel
Providers in this channel register background job processors and event handlers.

**Identifiers:** `Gateway`, `Worker`, `Processor`, `Batch`, `Message`, `Subscriber`, `Saga`, `Choreography`, `SSE`, `Stream`, `Metric`

**Provider Interface:**
```typescript
interface BindingProvider {
  name: string;
  filePath: string;
  kind: string;
  bind(): Promise<void> | void;
}
```

**⚠️ Fail-Fast Behavior:**
> Binding providers are fail-fast by design. If a `Worker().bind()` (or any other Binding identifier) fails during execution, the bootstrap process aborts with a clear `BINDING_EXECUTION_FAILED` error that includes the provider name. This prevents the application from running with critical integrations (e.g., queues, databases) in a broken state. This is different from Schedule, which is fail-soft (see Schedule Channel section).

**⚠️ Important Restriction:**
> A `Worker().bind()` (or any other Binding identifier) cannot depend on an alias registered via `Client()`/`Store()`/etc., because Binding executes before Alias Providers are activated in the `createApp()` pipeline. If you need to use aliases in your binding logic, consider using direct file imports instead of alias-based imports.

## Error Codes

The Extension API defines specific error codes for identifier registration failures:

- `INVALID_IDENTIFIER_NAME`: Invalid identifier name pattern
- `DUPLICATE_ALIAS_IDENTIFIER`: Duplicate alias identifier in the same file
- `DUPLICATE_MIDDLEWARE_IDENTIFIER`: Duplicate middleware identifier in the same file
- `DUPLICATE_SCHEDULE_IDENTIFIER`: Duplicate schedule identifier in the same file
- `DUPLICATE_BINDING_IDENTIFIER`: Duplicate binding identifier in the same file
- `DUPLICATE_EXTENSION_PROVIDER`: Duplicate provider across different files
- `BINDING_EXECUTION_FAILED`: Binding provider failed during bind() execution (fail-fast)
- `MIDDLEWARE_RESOLUTION_FAILED`: Middleware resolver failed during getHandlers() execution (fail-fast)
- `MISSING_PEER_DEPENDENCY`: Required peer dependency not installed
- `INVALID_CRON_EXPRESSION`: Invalid cron expression syntax

## Adapters

This package provides adapters for:

- **Express**: HTTP server integration
- **BullMQ**: Queue/worker integration (optional peer dependency)
- **node-cron**: Scheduling integration (optional peer dependency)
- **Socket.io**: Real-time integration (optional peer dependency)
- **ioredis**: Redis client for Message/Stream adapters (optional peer dependency)

## Gateway Binding

The `Gateway()` identifier provides Socket.io integration for real-time communication. It is implemented as a Binding channel provider, meaning it establishes WebSocket connections during bootstrap and follows fail-fast behavior.

**Usage:**
```typescript
import { Gateway } from '@kerith/identifiers';

Gateway('chat', (socket) => {
  socket.on('message', (data) => {
    // Handle incoming message
  });
}, { namespace: '/chat' });
```

**Implementation Status:**
- Identifier: ✅ Implemented in `@kerith/identifiers`
- Executor: ✅ Implemented in `@kerith/app` (calls `loadSocketIOTransport()`)
- Socket.io Adapter: ✅ Implemented in `@kerith/app` (lazy-loaded via `loadSocketIOTransport()`, requires `socket.io` as optional peer dependency)

## Version

Current version: v1.0.0-alpha.1
