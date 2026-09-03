// src/catalog/metadata.ts

export type IdentifierCategory =
  | "infrastructure"
  | "events"
  | "workers"
  | "security"
  | "http"
  | "data"
  | "observability"
  | "realtime"
  | "api"
  | "flags"
  | "i18n"
  | "cli"
  | "testing";

export interface IdentifierMetadata {
  name: string;
  category: IdentifierCategory;
  kind: "structural" | "logical";
  channel?: "alias" | "middleware" | "schedule" | "binding";
  trackable: boolean;
}

export const IDENTIFIER_CATALOG: IdentifierMetadata[] = [
  // ─── Infrastructure ───────────────────────────────────────────────────────
  {
    name: "Client",
    category: "infrastructure",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Config",
    category: "infrastructure",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Provider",
    category: "infrastructure",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Store",
    category: "infrastructure",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Vault",
    category: "infrastructure",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Registry",
    category: "infrastructure",
    kind: "structural",
    trackable: true,
  },
  {
    name: "Connection",
    category: "infrastructure",
    kind: "structural",
    trackable: true,
  },
  {
    name: "Adapter",
    category: "infrastructure",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Pool",
    category: "infrastructure",
    kind: "structural",
    trackable: true,
  },

  // ─── Events ───────────────────────────────────────────────────────────────
  { name: "Event", category: "events", kind: "structural", trackable: true },
  { name: "Handler", category: "events", kind: "structural", trackable: true },
  {
    name: "Projection",
    category: "events",
    kind: "structural",
    trackable: true,
  },
  { name: "Inbox", category: "events", kind: "structural", trackable: true },
  { name: "Topic", category: "events", kind: "structural", trackable: true },
  { name: "Queue", category: "events", kind: "structural", trackable: true },
  { name: "Channel", category: "events", kind: "structural", trackable: true },
  {
    name: "Publisher",
    category: "events",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "Subscriber",
    category: "events",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Message",
    category: "events",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Saga",
    category: "events",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Outbox",
    category: "events",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Choreography",
    category: "events",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },

  // ─── Workers ──────────────────────────────────────────────────────────────
  { name: "Job", category: "workers", kind: "structural", trackable: true },
  { name: "Task", category: "workers", kind: "structural", trackable: true },
  { name: "Step", category: "workers", kind: "structural", trackable: true },
  {
    name: "Scheduler",
    category: "workers",
    kind: "structural",
    trackable: true,
  },
  { name: "Runner", category: "workers", kind: "structural", trackable: true },
  {
    name: "Worker",
    category: "workers",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Processor",
    category: "workers",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Cron",
    category: "workers",
    kind: "logical",
    channel: "schedule",
    trackable: true,
  },
  {
    name: "Batch",
    category: "workers",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Pipeline",
    category: "workers",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Daemon",
    category: "workers",
    kind: "logical",
    channel: "schedule",
    trackable: true,
  },

  // ─── Security ─────────────────────────────────────────────────────────────
  { name: "Policy", category: "security", kind: "structural", trackable: true },
  {
    name: "Permission",
    category: "security",
    kind: "structural",
    trackable: true,
  },
  { name: "Role", category: "security", kind: "structural", trackable: true },
  { name: "Scope", category: "security", kind: "structural", trackable: true },
  { name: "Token", category: "security", kind: "structural", trackable: true },
  {
    name: "Session",
    category: "security",
    kind: "structural",
    trackable: true,
  },
  { name: "Audit", category: "security", kind: "structural", trackable: true },
  {
    name: "Guard",
    category: "security",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "RateLimit",
    category: "security",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "Firewall",
    category: "security",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "Validate",
    category: "security",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },

  // ─── HTTP ─────────────────────────────────────────────────────────────────
  {
    name: "Middleware",
    category: "http",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "Interceptor",
    category: "http",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "Pipe",
    category: "http",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "Filter",
    category: "http",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },
  {
    name: "Webhook",
    category: "http",
    kind: "logical",
    channel: "middleware",
    trackable: true,
  },

  // ─── Data ─────────────────────────────────────────────────────────────────
  { name: "Entity", category: "data", kind: "structural", trackable: true },
  { name: "Aggregate", category: "data", kind: "structural", trackable: true },
  {
    name: "ValueObject",
    category: "data",
    kind: "structural",
    trackable: true,
  },
  { name: "Migration", category: "data", kind: "structural", trackable: true },
  { name: "Seed", category: "data", kind: "structural", trackable: true },
  { name: "Fixture", category: "data", kind: "structural", trackable: false },
  { name: "Snapshot", category: "data", kind: "structural", trackable: true },
  { name: "View", category: "data", kind: "structural", trackable: true },
  { name: "Index", category: "data", kind: "structural", trackable: true },
  { name: "Query", category: "data", kind: "structural", trackable: true },

  // ─── Observability ────────────────────────────────────────────────────────
  {
    name: "Logger",
    category: "observability",
    kind: "structural",
    trackable: true,
  },
  {
    name: "Alert",
    category: "observability",
    kind: "structural",
    trackable: true,
  },
  {
    name: "Dashboard",
    category: "observability",
    kind: "structural",
    trackable: true,
  },
  {
    name: "Metric",
    category: "observability",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Tracer",
    category: "observability",
    kind: "logical",
    channel: "alias",
    trackable: true,
  },
  {
    name: "HealthCheck",
    category: "observability",
    kind: "logical",
    channel: "schedule",
    trackable: true,
  },
  {
    name: "Probe",
    category: "observability",
    kind: "logical",
    channel: "schedule",
    trackable: true,
  },

  // ─── Realtime ─────────────────────────────────────────────────────────────
  {
    name: "Gateway",
    category: "realtime",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  { name: "Room", category: "realtime", kind: "structural", trackable: true },
  {
    name: "Broadcast",
    category: "realtime",
    kind: "structural",
    trackable: true,
  },
  { name: "Socket", category: "realtime", kind: "structural", trackable: true },
  {
    name: "SSE",
    category: "realtime",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },
  {
    name: "Stream",
    category: "realtime",
    kind: "logical",
    channel: "binding",
    trackable: true,
  },

  // ─── API ──────────────────────────────────────────────────────────────────
  { name: "Endpoint", category: "api", kind: "structural", trackable: true },
  { name: "Route", category: "api", kind: "structural", trackable: true },
  { name: "Contract", category: "api", kind: "structural", trackable: true },
  { name: "Resolver", category: "api", kind: "structural", trackable: true },
  { name: "Mutation", category: "api", kind: "structural", trackable: true },
  {
    name: "Subscription",
    category: "api",
    kind: "structural",
    trackable: true,
  },
  { name: "Procedure", category: "api", kind: "structural", trackable: true },
  { name: "Resource", category: "api", kind: "structural", trackable: true },

  // ─── Flags ────────────────────────────────────────────────────────────────
  { name: "Flag", category: "flags", kind: "structural", trackable: true },
  {
    name: "Experiment",
    category: "flags",
    kind: "structural",
    trackable: true,
  },
  { name: "Variant", category: "flags", kind: "structural", trackable: true },
  { name: "Rollout", category: "flags", kind: "structural", trackable: true },

  // ─── i18n ─────────────────────────────────────────────────────────────────
  { name: "Locale", category: "i18n", kind: "structural", trackable: true },
  {
    name: "Translation",
    category: "i18n",
    kind: "structural",
    trackable: true,
  },
  { name: "Formatter", category: "i18n", kind: "structural", trackable: true },
  { name: "Timezone", category: "i18n", kind: "structural", trackable: true },

  // ─── CLI ──────────────────────────────────────────────────────────────────
  { name: "Command", category: "cli", kind: "structural", trackable: true },
  { name: "Subcommand", category: "cli", kind: "structural", trackable: true },
  { name: "Option", category: "cli", kind: "structural", trackable: true },
  { name: "Argument", category: "cli", kind: "structural", trackable: true },
  { name: "Prompt", category: "cli", kind: "structural", trackable: true },
  { name: "Script", category: "cli", kind: "structural", trackable: true },
  { name: "Hook", category: "cli", kind: "structural", trackable: true },

  // ─── Testing ──────────────────────────────────────────────────────────────
  { name: "Mock", category: "testing", kind: "structural", trackable: false },
  { name: "Stub", category: "testing", kind: "structural", trackable: false },
  {
    name: "Factory",
    category: "testing",
    kind: "structural",
    trackable: false,
  },
  {
    name: "Scenario",
    category: "testing",
    kind: "structural",
    trackable: false,
  },
];
