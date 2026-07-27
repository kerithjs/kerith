# @kerith/identifiers

Extended identifier catalog for the Kerith framework. Provides a comprehensive set of identifiers organized by functional categories (infrastructure, events, workers, security, http, data, observability, realtime, api, flags, i18n, cli, testing).

## Extension API Integration

This package integrates with the Kerith Extension API by registering providers across four channels:

- **Alias Channel**: Resolvable import aliases (e.g., `Client`, `Config`, `Adapter`, `Store`, `Vault`, `Provider`, `Publisher`, `Tracer`)
- **Middleware Channel**: Request/response processing (e.g., `Guard`, `RateLimit`, `Firewall`, `Middleware`, `Interceptor`, `Pipe`, `Filter`, `Webhook`)
- **Schedule Channel**: Scheduled tasks (e.g., `Cron`, `Daemon`, `HealthCheck`, `Probe`)
- **Binding Channel**: Background job processors and event handlers (e.g., `Worker`, `Processor`, `Batch`, `Message`, `Subscriber`, `Saga`, `Choreography`, `SSE`, `Stream`, `Metric`, `Gateway`)

## Catalog Structure

The identifier catalog is defined in `src/catalog/metadata.ts` and contains metadata for all identifiers including:
- `name`: The identifier name
- `category`: Functional category (infrastructure, events, workers, etc.)
- `kind`: Either "structural" or "logical"
- `channel`: Extension API channel (alias, middleware, schedule, binding) - only for logical identifiers
- `trackable`: Whether the identifier should be tracked in the registry

## Available Identifiers

### Infrastructure
- `Client` (alias) - HTTP client, DB driver, SDK instances
- `Config` (alias) - Configuration objects
- `Provider` (alias) - Service providers
- `Store` (alias) - State stores
- `Vault` (alias) - Secret vaults
- `Adapter` (alias) - External system integrations (port/adapter pattern)
- `Registry`, `Connection`, `Pool` (structural)

### Events
- `Publisher` (alias) - Event publishers
- `Subscriber` (binding) - Event subscribers
- `Message` (binding) - Message handlers
- `Saga` (binding) - Saga orchestrators
- `Outbox` (binding) - Outbox pattern
- `Choreography` (binding) - Choreography handlers
- `Event`, `Handler`, `Projection`, `Inbox`, `Topic`, `Queue`, `Channel` (structural)

### Workers
- `Worker` (binding) - Background workers
- `Processor` (binding) - Job processors
- `Cron` (schedule) - Cron jobs
- `Batch` (binding) - Batch processors
- `Pipeline` (binding) - Pipeline processors
- `Daemon` (schedule) - Daemon processes
- `Job`, `Task`, `Step`, `Scheduler`, `Runner` (structural)

### Security
- `Guard` (middleware) - Security guards
- `RateLimit` (middleware) - Rate limiters
- `Firewall` (middleware) - Firewalls
- `Policy`, `Permission`, `Role`, `Scope`, `Token`, `Session`, `Audit` (structural)

### HTTP
- `Middleware`, `Interceptor`, `Pipe`, `Filter`, `Webhook` (middleware)

### Data
- `Entity`, `Aggregate`, `ValueObject`, `Migration`, `Seed`, `Fixture`, `Snapshot`, `View`, `Index`, `Query` (structural)

### Observability
- `Metric` (binding) - Metrics collection
- `Tracer` (alias) - Distributed tracing
- `HealthCheck` (schedule) - Health checks
- `Probe` (schedule) - Probes
- `Logger`, `Alert`, `Dashboard` (structural)

### Realtime
- `Gateway` (binding) - Realtime gateways (Socket.io integration)
- `SSE` (binding) - Server-Sent Events
- `Stream` (binding) - Stream handlers
- `Room`, `Broadcast`, `Socket` (structural)

### API
- `Endpoint`, `Route`, `Contract`, `Resolver`, `Mutation`, `Subscription`, `Procedure`, `Resource` (structural)

### Flags
- `Flag`, `Experiment`, `Variant`, `Rollout` (structural)

### i18n
- `Locale`, `Translation`, `Formatter`, `Timezone` (structural)

### CLI
- `Command`, `Subcommand`, `Option`, `Argument`, `Prompt`, `Script`, `Hook` (structural)

### Testing
- `Mock`, `Stub`, `Factory`, `Scenario` (structural)

## Core Integration

This package depends on `@kerith/core` and uses the following public APIs:

- `getFileCallerInfo` - Exported from `@kerith/core` to capture file path information for identifier registration
- `getRegisteredIdentifierMetadata` - Public function from `@kerith/core` to read identifier metadata from the registry
- `registerIdentifierMetadata` - Function to register identifier metadata in the extension store

## Usage Example

```typescript
import { Client, Guard, Cron, Worker } from '@kerith/identifiers';

// Alias channel - resolvable import
Client('db', () => new DatabaseClient());

// Middleware channel - request processing
Guard('jwt', () => async (req, res, next) => {
  // JWT validation logic
});

// Schedule channel - scheduled tasks
Cron('cleanup', '0 2 * * *', async () => {
  // Cleanup logic
});

// Binding channel - background jobs
Worker('email', async (job) => {
  // Email processing logic
});
```

## Version

Current version: v1.0.0-alpha.1
