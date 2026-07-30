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

// ─── Infrastructure — Alias channel ───────────────────────────────────────────
export { Client } from './infrastructure/client.js'
export { Config } from './infrastructure/config.js'
export { Provider } from './infrastructure/provider.js'
export { Store } from './infrastructure/store.js'
export { Adapter } from './infrastructure/adapter.js'
export type { AliasIdentifierOptions } from './infrastructure/_alias-factory.js'

// ─── Security — Middleware channel ────────────────────────────────────────────
export { Guard } from './security/guard.js'
export type { GuardOptions } from './security/guard.js'
export { RateLimit } from './security/rate-limit.js'
export type { RateLimitOptions } from './security/rate-limit.js'

// ─── HTTP — Middleware channel ─────────────────────────────────────────────────
export { Middleware } from './http/middleware.js'
export { Filter } from './http/filter.js'

// ─── Workers — Schedule channel ───────────────────────────────────────────────
export { Cron } from './workers/cron.js'
export type { CronOptions } from './workers/cron.js'

// ─── Workers — Binding channel ────────────────────────────────────────────────
export { Worker } from './workers/worker.js'
export type { WorkerOptions } from './workers/worker.js'

// ─── Observability — Schedule channel ─────────────────────────────────────────
export { HealthCheck } from './observability/health-check.js'
export type { HealthCheckResult } from './observability/health-check.js'
export { Probe } from './observability/probe.js'

// ─── Events — Binding channel ─────────────────────────────────────────────────
export { Message } from './events/message.js'
export type { MessageOptions } from './events/message.js'

// ─── Realtime — Binding channel ───────────────────────────────────────────────
export { Stream } from './realtime/stream.js'
export type { StreamOptions } from './realtime/stream.js'
export { Gateway } from './realtime/gateway.js'
export type { GatewayOptions } from './realtime/gateway.js'


