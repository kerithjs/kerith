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

The `Gateway()` identifier provides Socket.io integration for real-time communication. It is implemented as a Binding channel provider, meaning it is registered during bootstrap but establishes WebSocket connections during `.listen()` and follows fail-fast behavior.

**Usage:**
```typescript
import { Gateway } from '@kerith/identifiers';

Gateway('chat', (socket) => {
  socket.on('message', (data) => {
    // Handle incoming message
  });
}, { namespace: '/chat' });
```

**Lifecycle:**
- **Bootstrap**: `Gateway()` declarations are registered as BindingProviders
- **Listen**: When `kerithApp.listen(server)` is called, Socket.io attaches to the HTTP server and processes pending connections

**Implementation Status:**
- Identifier: ✅ Implemented in `@kerith/identifiers`
- Executor: ✅ Implemented in `@kerith/app` (calls `loadSocketIOTransport()` in `executeGatewayChannel()`)
- Socket.io Adapter: ✅ Implemented in `@kerith/app` (lazy-loaded via `loadSocketIOTransport()`, requires `socket.io` as optional peer dependency)
- Gateway Bridge: ✅ Implemented in `@kerith/app` (wraps `kerithApp.listen()` to call `attach(server)` when Gateway() is declared)

## Configuration

When initializing the app via `createApp` from `@kerith/app`, you can provide optional infrastructure configurations (like Redis settings) that override environment variables. This is particularly useful for tests or isolated environments.

```typescript
import { createApp } from '@kerith/app';

const app = await createApp(baseApp, {
  infrastructure: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'my-password'
    }
  }
});
```

If `infrastructure` is not provided, the adapters will default to using environment variables (e.g., `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`) or fallback to defaults (`localhost:6379`).

## Controller Decorators

Kerith provides class-based controller decorators (`@Controller`, `@Get`, `@Post`, etc.) for organizing HTTP routes. This is an alternative to the traditional `Controller()` function approach.

### Usage

```typescript
import { Controller, Get, Post, Put, Patch, Delete } from '@kerith/app';

@Controller('/users')
class UsersController {
  @Get('/')
  async getUsers(req: any, res: any) {
    res.json([{ id: 1, name: 'John' }]);
  }

  @Get('/:id')
  async getUser(req: any, res: any) {
    const { id } = req.params;
    res.json({ id, name: 'John' });
  }

  @Post('/')
  async createUser(req: any, res: any) {
    const user = req.body;
    res.status(201).json({ id: 2, ...user });
  }

  @Put('/:id')
  async updateUser(req: any, res: any) {
    const { id } = req.params;
    const updates = req.body;
    res.json({ id, ...updates });
  }

  @Patch('/:id')
  async patchUser(req: any, res: any) {
    const { id } = req.params;
    const updates = req.body;
    res.json({ id, ...updates });
  }

  @Delete('/:id')
  async deleteUser(req: any, res: any) {
    const { id } = req.params;
    res.status(204).send();
  }
}

export default UsersController;
```

### Options

The `@Controller` decorator accepts an optional configuration object:

```typescript
@Controller('/users', {
  middlewares: [authMiddleware, loggingMiddleware],
  metadata: { guards: ['admin'], rateLimit: 100 }
})
class UsersController {
  // ...
}
```

**⚠️ Dependency Injection Limitation:**
> Controllers are instantiated without constructor arguments — Kerith does not currently have a dependency injection container. If a controller needs a Service or other dependency, it must be imported directly within the method rather than injected via constructor. For example:
> ```typescript
> import { Service } from './services/service.js'
>
> @Controller('/users')
> class UserController {
>   @Get()
>   async getUsers() {
>     const service = new Service() // Import and instantiate directly
>     return service.findAll()
>   }
> }
> ```

### Parameter Decorators

Parameter decorators extract values from the incoming request and pass them as arguments to the handler method. They are **pure extractors** — no validation, no transformation, no cloning. The raw Express value is passed directly.

```typescript
import { Controller, Get, Post, Body, Param, Query, Headers, Req, Res } from '@kerith/app';

@Controller('/items')
class ItemsController {
  @Get('/:id')
  async getOne(@Param('id') id: string, @Query('v') version: string) {
    // id   = req.params.id
    // version = req.query.v
  }

  @Post('/')
  async create(@Body() body: any, @Res() res: any) {
    // body = req.body (as parsed by Express — requires express.json() middleware)
    res.status(201).json({ ...body });
  }

  @Get('/raw')
  async raw(@Req() req: any, @Res() res: any) {
    // full Express Request and Response objects
    res.json({ method: req.method });
  }
}
```

#### Available decorators

| Decorator | Resolves to |
|-----------|-------------|
| `@Body()` | `req.body` |
| `@Param(key?)` | `req.params[key]` if `key` given, `req.params` otherwise |
| `@Query(key?)` | `req.query[key]` if `key` given, `req.query` otherwise |
| `@Headers(key?)` | `req.headers[key]` if `key` given, `req.headers` otherwise |
| `@Req()` | `req` (full Express Request) |
| `@Res()` | `res` (full Express Response) |

#### Known restrictions

**No serialization of return values.**
> When parameter decorators are used on a handler, Kerith does **not** automatically serialize the return value as a JSON response. `@Res()` is the only way to send a response. This is intentional — automatic serialization would conflict with streaming, SSE, and other non-JSON response patterns.

**`@Headers(key)` expects lowercase header names.**
> Express normalizes all incoming header names to lowercase (`content-type`, not `Content-Type`). Using `@Headers('Content-Type')` will always return `undefined`. Always use the lowercase form: `@Headers('content-type')`.

**Parameter decorators are not supported on constructor parameters.**
> Kerith has no dependency injection container. Applying `@Body()` or any other parameter decorator to a constructor parameter throws a `TypeError` at decoration time with a clear error message. Dependencies must be imported directly inside methods.

**Arrow function class fields are not supported.**
> TypeScript does not emit parameter decorator calls for arrow function class fields (e.g., `getUser = async (req, res) => {}`). Parameter decorators only work on regular method declarations. This is a TypeScript compiler limitation, not a Kerith restriction.

### Compatibility

- Class-based decorators (`@Controller`) work alongside the traditional `Controller()` function
- If both are used in the same file, the `Controller()` function takes precedence
- The `@Controller` decorator automatically integrates with the Extension API (e.g., `Guard()`, `RateLimit()`) via the `metadata` option
- Routes **without** any parameter decorators (Fase 1 style) continue to receive `(req, res, next)` exactly as before — no behavioral change

## Version

Current version: v2.0.0-alpha.2

