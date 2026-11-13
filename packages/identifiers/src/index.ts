// src/index.ts

// ─── Channels — only getters, never registration functions ────────────────────
export {
  getAliasPlugins,
  getMiddlewarePlugins,
  getSchedulePlugins,
  getBindingPlugins,
  _resetAllChannels,
} from './channels/index.js'

// ─── Catalog ──────────────────────────────────────────────────────────────────
export { IDENTIFIER_CATALOG } from './catalog/metadata.js'
export type { IdentifierMetadata, IdentifierCategory } from './catalog/metadata.js'

// ─── Structural Store & Base Factory ──────────────────────────────────────────
export {
  createStructuralIdentifier,
  registerStructuralEntry,
  getStructuralEntries,
  getStructuralEntriesByType,
  getStructuralEntriesByCategory,
  _resetStructuralStore,
} from './structural/index.js'
export type { StructuralEntry, BaseStructuralOptions } from './structural/index.js'

// ─── Infrastructure — Logical (Alias channel) ─────────────────────────────────
export { Client } from './infrastructure/client.js'
export { Config } from './infrastructure/config.js'
export { Provider } from './infrastructure/provider.js'
export { Store } from './infrastructure/store.js'
export { Adapter } from './infrastructure/adapter.js'
export type { AliasIdentifierOptions } from './infrastructure/_alias-factory.js'

// ─── Infrastructure — Structural ──────────────────────────────────────────────
export { Registry, Connection, Pool } from './infrastructure/structural.js'
export type { RegistryOptions, ConnectionOptions, PoolOptions } from './infrastructure/structural.js'

// ─── Security — Logical (Middleware channel) ──────────────────────────────────
export { Guard } from './security/guard.js'
export type { GuardOptions } from './security/guard.js'
export { RateLimit } from './security/rate-limit.js'
export type { RateLimitOptions } from './security/rate-limit.js'
export { Validate } from './security/validate.js'
export type { ValidateOptions, ValidatableSchema } from './security/validate.js'

// ─── Security — Structural ────────────────────────────────────────────────────
export {
  Policy,
  Permission,
  Role,
  Scope,
  Token,
  Session,
  Audit,
} from './security/structural.js'
export type {
  PolicyOptions,
  PermissionOptions,
  RoleOptions,
  ScopeOptions,
  TokenOptions,
  SessionOptions,
  AuditOptions,
} from './security/structural.js'

// ─── HTTP — Logical (Middleware channel) ──────────────────────────────────────
export { Middleware } from './http/middleware.js'
export { Filter } from './http/filter.js'

// ─── Workers — Logical (Schedule & Binding channels) ──────────────────────────
export { Cron } from './workers/cron.js'
export type { CronOptions } from './workers/cron.js'
export { Worker } from './workers/worker.js'
export type { WorkerOptions } from './workers/worker.js'

// ─── Workers — Structural ─────────────────────────────────────────────────────
export {
  Job,
  Task,
  Step,
  Scheduler,
  Runner,
} from './workers/structural.js'
export type {
  JobOptions,
  TaskOptions,
  StepOptions,
  SchedulerOptions,
  RunnerOptions,
} from './workers/structural.js'

// ─── Observability — Logical (Schedule channel) ───────────────────────────────
export { HealthCheck } from './observability/health-check.js'
export type { HealthCheckResult } from './observability/health-check.js'
export { Probe } from './observability/probe.js'

// ─── Observability — Structural ───────────────────────────────────────────────
export { Logger, Alert, Dashboard } from './observability/structural.js'
export type { LoggerOptions, AlertOptions, DashboardOptions } from './observability/structural.js'

// ─── Events — Logical (Binding channel) ───────────────────────────────────────
export { Message } from './events/message.js'
export type { MessageOptions } from './events/message.js'

// ─── Events — Structural ──────────────────────────────────────────────────────
export {
  Event,
  Handler,
  Projection,
  Inbox,
  Topic,
  Queue,
  Channel,
} from './events/structural.js'
export type {
  EventOptions,
  HandlerOptions,
  ProjectionOptions,
  InboxOptions,
  TopicOptions,
  QueueOptions,
  ChannelOptions,
} from './events/structural.js'

// ─── Realtime — Logical (Binding channel) ─────────────────────────────────────
export { Stream } from './realtime/stream.js'
export type { StreamOptions } from './realtime/stream.js'
export { Gateway } from './realtime/gateway.js'
export type { GatewayOptions } from './realtime/gateway.js'

// ─── Realtime — Structural ────────────────────────────────────────────────────
export { Room, Broadcast, Socket } from './realtime/structural.js'
export type { RoomOptions, BroadcastOptions, SocketOptions } from './realtime/structural.js'

// ─── Data — Structural ────────────────────────────────────────────────────────
export {
  Entity,
  Aggregate,
  ValueObject,
  Migration,
  Seed,
  Fixture,
  Snapshot,
  View,
  Index,
  Query,
} from './data/index.js'
export type {
  EntityOptions,
  AggregateOptions,
  ValueObjectOptions,
  MigrationOptions,
  SeedOptions,
  FixtureOptions,
  SnapshotOptions,
  ViewOptions,
  IndexOptions,
  QueryOptions,
} from './data/index.js'

// ─── API — Structural ─────────────────────────────────────────────────────────
export {
  Endpoint,
  Route,
  Contract,
  Resolver,
  Mutation,
  Subscription,
  Procedure,
  Resource,
} from './api/index.js'
export type {
  EndpointOptions,
  RouteOptions,
  ContractOptions,
  ResolverOptions,
  MutationOptions,
  SubscriptionOptions,
  ProcedureOptions,
  ResourceOptions,
} from './api/index.js'

// ─── Flags — Structural ───────────────────────────────────────────────────────
export { Flag, Experiment, Variant, Rollout } from './flags/index.js'
export type {
  FlagOptions,
  ExperimentOptions,
  VariantOptions,
  RolloutOptions,
} from './flags/index.js'

// ─── i18n — Structural ────────────────────────────────────────────────────────
export { Locale, Translation, Formatter, Timezone } from './i18n/index.js'
export type {
  LocaleOptions,
  TranslationOptions,
  FormatterOptions,
  TimezoneOptions,
} from './i18n/index.js'

// ─── CLI — Structural ─────────────────────────────────────────────────────────
export {
  Command,
  Subcommand,
  Option,
  Argument,
  Prompt,
  Script,
  Hook,
} from './cli/index.js'
export type {
  CommandOptions,
  SubcommandOptions,
  OptionOptions,
  ArgumentOptions,
  PromptOptions,
  ScriptOptions,
  HookOptions,
} from './cli/index.js'

// ─── Testing — Structural ─────────────────────────────────────────────────────
export { Mock, Stub, Factory, Scenario } from './testing/index.js'
export type {
  MockOptions,
  StubOptions,
  FactoryOptions,
  ScenarioOptions,
} from './testing/index.js'
